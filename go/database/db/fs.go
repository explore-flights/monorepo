package db

import _ "embed"

//go:embed schema.sql
var Schema string

//go:embed 11_load_raw_data.sql
var X11LoadRawData string

//go:embed 12_update_database.sql
var X12UpdateDatabase string

//go:embed 13_update_history.sql
var X13UpdateHistory string
