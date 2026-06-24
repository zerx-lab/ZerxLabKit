package service

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"gorm.io/gorm"

	zerxv1 "github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1"
	"github.com/zerx-lab/zerxlabkit/gen/go/zerx/v1/zerxv1connect"
	"github.com/zerx-lab/zerxlabkit/internal/model"
	"github.com/zerx-lab/zerxlabkit/internal/storage"
)

// FileService implements zerxv1connect.FileServiceHandler.
type FileService struct {
	db    *gorm.DB
	store storage.Storage
}

var _ zerxv1connect.FileServiceHandler = (*FileService)(nil)

// NewFileService constructs the file handler.
func NewFileService(db *gorm.DB, store storage.Storage) *FileService {
	return &FileService{db: db, store: store}
}

func (s *FileService) ListFiles(ctx context.Context, req *connect.Request[zerxv1.ListFilesRequest]) (*connect.Response[zerxv1.ListFilesResponse], error) {
	_, ps, offset := normalizePage(req.Msg.GetPage().GetPage(), req.Msg.GetPage().GetPageSize())
	like := "%" + req.Msg.GetKeyword() + "%"

	base := gorm.G[model.File](s.db)
	if req.Msg.GetKeyword() != "" {
		filtered := base.Where("name LIKE ?", like)
		total, err := filtered.Count(ctx, "id")
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}
		files, err := filtered.Order("id DESC").Limit(ps).Offset(offset).Find(ctx)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}
		return connect.NewResponse(&zerxv1.ListFilesResponse{Files: protoFiles(files), Total: total}), nil
	}

	total, err := base.Count(ctx, "id")
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	files, err := gorm.G[model.File](s.db).Order("id DESC").Limit(ps).Offset(offset).Find(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.ListFilesResponse{Files: protoFiles(files), Total: total}), nil
}

func protoFiles(files []model.File) []*zerxv1.File {
	out := make([]*zerxv1.File, 0, len(files))
	for i := range files {
		out = append(out, toProtoFile(files[i]))
	}

	return out
}

func (s *FileService) DeleteFile(ctx context.Context, req *connect.Request[zerxv1.DeleteFileRequest]) (*connect.Response[zerxv1.DeleteFileResponse], error) {
	f, err := gorm.G[model.File](s.db).Where("id = ?", req.Msg.GetId()).First(ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("file not found"))
		}
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if _, err := gorm.G[model.File](s.db).Where("id = ?", f.ID).Delete(ctx); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if err := s.store.Delete(ctx, f.Key); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&zerxv1.DeleteFileResponse{}), nil
}
