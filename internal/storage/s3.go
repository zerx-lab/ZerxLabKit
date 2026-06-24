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

// Save uploads the reader to the bucket.
func (s *S3) Save(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	if _, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{ContentType: contentType}); err != nil {
		return fmt.Errorf("put object: %w", err)
	}

	return nil
}

// Delete removes the object from the bucket.
func (s *S3) Delete(ctx context.Context, key string) error {
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("remove object: %w", err)
	}

	return nil
}

// PublicURL returns the configured public base URL for key, or "" when unset.
func (s *S3) PublicURL(key string) string {
	if s.publicBaseURL != "" {
		return s.publicBaseURL + "/" + key
	}

	return ""
}

// Open streams the object for reading along with its last-modified time.
func (s *S3) Open(ctx context.Context, key string) (io.ReadSeekCloser, time.Time, error) {
	o, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("get object: %w", err)
	}
	st, err := o.Stat()
	if err != nil {
		_ = o.Close()
		return nil, time.Time{}, fmt.Errorf("stat object: %w", err)
	}

	return o, st.LastModified, nil
}

// Presign returns a time-limited presigned GET URL for key.
func (s *S3) Presign(ctx context.Context, key string, ttl time.Duration) (string, error) {
	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, ttl, nil)
	if err != nil {
		return "", fmt.Errorf("presign object: %w", err)
	}

	return u.String(), nil
}
