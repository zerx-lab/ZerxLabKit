package model

// Query is the input interface consumed by GORM CLI (`gorm gen`). The leading
// SQL comment on each method is turned into a type-safe, generated query in
// internal/query. Use bound parameters (@name) rather than DB-specific string
// functions so the generated SQL stays portable across sqlite/postgres/mysql.
// Raw queries bypass GORM's soft-delete scope, so filter deleted_at explicitly.
//
// Generate with: task gen:db
type Query[T any] interface {
	// SELECT * FROM @@table WHERE name LIKE @keyword AND deleted_at IS NULL
	SearchByName(keyword string) ([]T, error)
}
