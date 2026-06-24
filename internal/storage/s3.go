package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/minio/minio-go/v7"
)

// S3 stores blobs in an S3-compatible bucket via the minio client.
type S3 struct {
	client        *minio.Client
	bucket        string
	publicBaseURL string
}

// Save uploads the reader and returns a public URL: the configured base URL when
// set, otherwise a 7-day presigned GET URL.
func (s *S3) Save(ctx context.Context, key string, r io.Reader, size int64, contentType string) (string, error) {
	if _, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{ContentType: contentType}); err != nil {
		return "", fmt.Errorf("put object: %w", err)
	}

	if s.publicBaseURL != "" {
		return s.publicBaseURL + "/" + key, nil
	}

	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, 7*24*time.Hour, nil)
	if err != nil {
		return "", fmt.Errorf("presign object: %w", err)
	}

	return u.String(), nil
}

// Delete removes the object from the bucket.
func (s *S3) Delete(ctx context.Context, key string) error {
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("remove object: %w", err)
	}

	return nil
}
