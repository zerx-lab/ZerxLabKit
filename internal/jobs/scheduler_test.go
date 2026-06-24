package jobs

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/zerx-lab/zerxlabkit/internal/database"
	"github.com/zerx-lab/zerxlabkit/internal/model"
)

func newJobDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

// insertJob creates a ScheduledJob row and returns its ID.
func insertJob(t *testing.T, db *gorm.DB, name, handler string) uint64 {
	t.Helper()
	job := model.ScheduledJob{
		Name:     name,
		Handler:  handler,
		CronExpr: "0 3 * * *",
		Enabled:  true,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job row: %v", err)
	}
	return job.ID
}

// pollExecution waits up to 2 s for a JobExecution row to appear for jobID.
func pollExecution(t *testing.T, db *gorm.DB, jobID uint64) model.JobExecution {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		var exec model.JobExecution
		err := db.Where("job_id = ?", jobID).First(&exec).Error
		if err == nil {
			return exec
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for JobExecution row for job %d", jobID)
	return model.JobExecution{}
}

func TestRunNowOkHandler(t *testing.T) {
	db := newJobDB(t)

	called := make(chan struct{}, 1)
	registry := Registry{
		"test_ok": {
			Description: "succeeds",
			Handler: func(ctx context.Context) error {
				called <- struct{}{}
				return nil
			},
		},
	}

	sched, err := New(db, registry, slog.Default())
	if err != nil {
		t.Fatalf("New scheduler: %v", err)
	}

	jobID := insertJob(t, db, "myjob_ok", "test_ok")

	if err := sched.RunNow(jobID, "myjob_ok", "test_ok"); err != nil {
		t.Fatalf("RunNow: %v", err)
	}

	// Wait for the goroutine to invoke the handler.
	select {
	case <-called:
	case <-time.After(2 * time.Second):
		t.Fatal("handler was not called within 2s")
	}

	exec := pollExecution(t, db, jobID)
	if exec.Status != "ok" {
		t.Errorf("JobExecution.Status = %q, want ok", exec.Status)
	}
	if exec.Error != "" {
		t.Errorf("JobExecution.Error = %q, want empty", exec.Error)
	}
}

func TestRunNowErrorHandler(t *testing.T) {
	db := newJobDB(t)

	registry := Registry{
		"test_err": {
			Description: "always fails",
			Handler: func(ctx context.Context) error {
				return errors.New("something broke")
			},
		},
	}

	sched, err := New(db, registry, slog.Default())
	if err != nil {
		t.Fatalf("New scheduler: %v", err)
	}

	jobID := insertJob(t, db, "myjob_err", "test_err")

	if err := sched.RunNow(jobID, "myjob_err", "test_err"); err != nil {
		t.Fatalf("RunNow: %v", err)
	}

	exec := pollExecution(t, db, jobID)
	if exec.Status != "error" {
		t.Errorf("JobExecution.Status = %q, want error", exec.Status)
	}
	if exec.Error == "" {
		t.Error("JobExecution.Error is empty, want non-empty message")
	}
}

func TestNewRegistry(t *testing.T) {
	db := newJobDB(t)
	reg := NewRegistry(db)

	if _, ok := reg["log_cleanup"]; !ok {
		t.Error("NewRegistry: missing log_cleanup handler")
	}
	if _, ok := reg["session_cleanup"]; !ok {
		t.Error("NewRegistry: missing session_cleanup handler")
	}
}
