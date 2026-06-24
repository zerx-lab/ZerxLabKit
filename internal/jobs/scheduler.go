package jobs

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/go-co-op/gocron/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/zerx-lab/zerxlabkit/internal/model"
)

// Scheduler runs enabled ScheduledJob rows on their cron schedules, recording a
// JobExecution per run. It is constructed in main and injected into the server.
type Scheduler struct {
	sch      gocron.Scheduler
	db       *gorm.DB
	registry Registry
	logger   *slog.Logger
	jobs     map[string]uuid.UUID // job name -> gocron job id
}

// New builds a Scheduler. Call Start to load and schedule enabled jobs.
func New(db *gorm.DB, registry Registry, logger *slog.Logger) (*Scheduler, error) {
	sch, err := gocron.NewScheduler(gocron.WithDistributedLocker(&dbLocker{
		db:    db,
		owner: uuid.NewString(),
		ttl:   30 * time.Second,
	}))
	if err != nil {
		return nil, err
	}

	return &Scheduler{sch: sch, db: db, registry: registry, logger: logger, jobs: make(map[string]uuid.UUID)}, nil
}

// Start schedules all enabled jobs and starts the scheduler. Uses a background
// context for the initial load (called before the signal context exists).
func (s *Scheduler) Start() error {
	ctx := context.Background()
	var rows []model.ScheduledJob
	if err := s.db.WithContext(ctx).Where("enabled = ?", true).Find(&rows).Error; err != nil {
		return err
	}
	for i := range rows {
		if err := s.schedule(rows[i]); err != nil {
			s.logger.Warn("schedule job failed", "job", rows[i].Name, "err", err)
		}
	}
	s.sch.Start()

	return nil
}

// schedule registers a gocron job for the given DB row, replacing any existing.
func (s *Scheduler) schedule(job model.ScheduledJob) error {
	desc, ok := s.registry[job.Handler]
	if !ok {
		return errors.New("unknown handler: " + job.Handler)
	}
	if id, ok := s.jobs[job.Name]; ok {
		_ = s.sch.RemoveJob(id)
		delete(s.jobs, job.Name)
	}
	j, err := s.sch.NewJob(
		gocron.CronJob(job.CronExpr, false),
		gocron.NewTask(s.wrap(job.ID, job.Name, desc.Handler)),
	)
	if err != nil {
		return err
	}
	s.jobs[job.Name] = j.ID()

	return nil
}

// wrap records a JobExecution around the handler and updates LastRunAt.
func (s *Scheduler) wrap(jobID uint64, name string, h HandlerFunc) func() {
	return func() {
		ctx := context.Background()
		start := time.Now()
		runErr := h(ctx)
		finished := time.Now()
		status := "ok"
		errStr := ""
		if runErr != nil {
			status = "error"
			errStr = runErr.Error()
		}
		exec := model.JobExecution{
			JobID:      jobID,
			StartedAt:  start,
			FinishedAt: finished,
			Status:     status,
			Error:      errStr,
			DurationMS: finished.Sub(start).Milliseconds(),
		}
		if err := s.db.WithContext(ctx).Create(&exec).Error; err != nil {
			s.logger.Warn("record job execution failed", "job", name, "err", err)
		}
		if err := s.db.WithContext(ctx).Model(&model.ScheduledJob{}).Where("id = ?", jobID).Update("last_run_at", finished).Error; err != nil {
			s.logger.Warn("update last_run_at failed", "job", name, "err", err)
		}
	}
}

// Reschedule applies the current DB state of a job: schedules it when enabled,
// removes it when disabled.
func (s *Scheduler) Reschedule(job model.ScheduledJob) error {
	if !job.Enabled {
		s.Remove(job.Name)
		return nil
	}
	return s.schedule(job)
}

// Remove unschedules a job by name (no-op if absent).
func (s *Scheduler) Remove(name string) {
	if id, ok := s.jobs[name]; ok {
		_ = s.sch.RemoveJob(id)
		delete(s.jobs, name)
	}
}

// RunNow executes a registered handler immediately (recording an execution).
func (s *Scheduler) RunNow(jobID uint64, name, handler string) error {
	desc, ok := s.registry[handler]
	if !ok {
		return errors.New("unknown handler: " + handler)
	}
	go s.wrap(jobID, name, desc.Handler)()

	return nil
}

// Shutdown stops the scheduler, blocking until running jobs finish.
func (s *Scheduler) Shutdown() error {
	return s.sch.Shutdown()
}
