// Package storage abstracts object persistence behind a small interface with a
// local-disk and an S3-compatible (minio) implementation.
package storage

import (
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/zerx-lab/zerxlabkit/internal/config"
)

// Storage saves and deletes blobs by key, returning a publicly reachable URL.
type Storage interface {
	Save(ctx context.Context, key string, r io.Reader, size int64, contentType string) (url string, err error)
	Delete(ctx context.Context, key string) error
}

// New constructs a Storage from configuration; driver is "local" or "s3".
func New(cfg config.StorageConfig) (Storage, error) {
	switch cfg.Driver {
	case "local":
		return &Local{dir: cfg.LocalDir, baseURL: cfg.LocalBaseURL}, nil
	case "s3":
		client, err := minio.New(cfg.S3Endpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, ""),
			Secure: cfg.S3Secure,
			Region: cfg.S3Region,
		})
		if err != nil {
			return nil, fmt.Errorf("init s3 client: %w", err)
		}

		return &S3{client: client, bucket: cfg.S3Bucket, publicBaseURL: cfg.S3PublicURL}, nil
	default:
		return nil, fmt.Errorf("unsupported storage driver %q (want local|s3)", cfg.Driver)
	}
}
