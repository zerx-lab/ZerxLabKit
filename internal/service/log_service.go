package service

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"gorm.io/gorm"

	zerxv1 "github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1"
	"github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1/zerxv1connect"
	"github.com/zerx-lab/zerxlabkit/internal/model"
)

// LogService implements zerxv1connect.LogServiceHandler.
type LogService struct {
	db *gorm.DB
}

var _ zerxv1connect.LogServiceHandler = (*LogService)(nil)

// NewLogService constructs the log handler.
func NewLogService(db *gorm.DB) *LogService {
	return &LogService{db: db}
}

func (s *LogService) ListOperationLogs(ctx context.Context, req *connect.Request[zerxv1.ListOperationLogsRequest]) (*connect.Response[zerxv1.ListOperationLogsResponse], error) {
	logs, total, err := s.queryOperation(ctx, req.Msg.GetPage().GetPage(), req.Msg.GetPage().GetPageSize(), req.Msg.GetKeyword(), false)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.ListOperationLogsResponse{Logs: logs, Total: total}), nil
}

func (s *LogService) ListErrorLogs(ctx context.Context, req *connect.Request[zerxv1.ListErrorLogsRequest]) (*connect.Response[zerxv1.ListErrorLogsResponse], error) {
	logs, total, err := s.queryOperation(ctx, req.Msg.GetPage().GetPage(), req.Msg.GetPage().GetPageSize(), req.Msg.GetKeyword(), true)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.ListErrorLogsResponse{Logs: logs, Total: total}), nil
}

func (s *LogService) queryOperation(ctx context.Context, page, pageSize int32, keyword string, errorsOnly bool) ([]*zerxv1.OperationLog, int64, error) {
	_, ps, offset := normalizePage(page, pageSize)

	q := s.db.WithContext(ctx).Model(&model.OperationLog{})
	if errorsOnly {
		q = q.Where("status <> ?", "ok")
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("procedure LIKE ? OR user_email LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []model.OperationLog
	if err := q.Order("id DESC").Limit(ps).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	out := make([]*zerxv1.OperationLog, 0, len(rows))
	for i := range rows {
		out = append(out, toProtoOperationLog(rows[i]))
	}

	return out, total, nil
}

func (s *LogService) ListLoginLogs(ctx context.Context, req *connect.Request[zerxv1.ListLoginLogsRequest]) (*connect.Response[zerxv1.ListLoginLogsResponse], error) {
	_, ps, offset := normalizePage(req.Msg.GetPage().GetPage(), req.Msg.GetPage().GetPageSize())

	q := s.db.WithContext(ctx).Model(&model.LoginLog{})
	if kw := req.Msg.GetKeyword(); kw != "" {
		like := "%" + kw + "%"
		q = q.Where("email LIKE ? OR ip LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	var rows []model.LoginLog
	if err := q.Order("id DESC").Limit(ps).Offset(offset).Find(&rows).Error; err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	out := make([]*zerxv1.LoginLog, 0, len(rows))
	for i := range rows {
		out = append(out, toProtoLoginLog(rows[i]))
	}

	return connect.NewResponse(&zerxv1.ListLoginLogsResponse{Logs: out, Total: total}), nil
}

func (s *LogService) CleanLogs(ctx context.Context, req *connect.Request[zerxv1.CleanLogsRequest]) (*connect.Response[zerxv1.CleanLogsResponse], error) {
	days := req.Msg.GetDays()
	if days < 0 {
		days = 0
	}
	cutoff := time.Now().AddDate(0, 0, -int(days))

	var res *gorm.DB
	switch req.Msg.GetType() {
	case zerxv1.LogType_LOG_TYPE_LOGIN:
		res = s.db.WithContext(ctx).Where("created_at < ?", cutoff).Delete(&model.LoginLog{})
	default:
		res = s.db.WithContext(ctx).Where("created_at < ?", cutoff).Delete(&model.OperationLog{})
	}
	if res.Error != nil {
		return nil, connect.NewError(connect.CodeInternal, res.Error)
	}

	return connect.NewResponse(&zerxv1.CleanLogsResponse{Removed: res.RowsAffected}), nil
}
