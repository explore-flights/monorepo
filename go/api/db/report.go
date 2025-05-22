package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/gofrs/uuid/v5"
	"reflect"
	"strings"
)

type reportRepoDatabase interface {
	Conn(ctx context.Context) (*sql.Conn, error)
}

type ReportDimensions struct {
	YearLocal                    bool `field:"year_local"`
	MonthLocal                   bool `field:"month_local"`
	ScheduleYear                 bool `field:"schedule_year"`
	IsSummerSchedule             bool `field:"is_summer_schedule"`
	AirlineId                    bool `field:"airline_id"`
	Number                       bool `field:"number"`
	Suffix                       bool `field:"suffix"`
	DepartureAirportId           bool `field:"departure_airport_id"`
	ArrivalAirportId             bool `field:"arrival_airport_id"`
	AircraftId                   bool `field:"aircraft_id"`
	AircraftConfigurationVersion bool `field:"aircraft_configuration_version"`
	IsOperating                  bool `field:"is_operating"`
	DurationSecondsTrunc5m       bool `field:"duration_seconds_5m_trunc"`
}

func (rd ReportDimensions) fields() []string {
	fields := make([]string, 0)

	rv := reflect.ValueOf(rd)
	rvt := rv.Type()
	for i := range rv.NumField() {
		rvField := rv.Field(i)
		if rvField.Kind() == reflect.Bool && rvField.Bool() {
			if field, ok := rvt.Field(i).Tag.Lookup("field"); ok {
				fields = append(fields, field)
			}
		}
	}

	return fields
}

type BinaryOperator uint8
type ReportFilters struct {
	Operator BinaryOperator
	Lhs      ReportFilter
	Rhs      ReportFilter
}

type ReportFilter struct {
}

type ReportRequest struct {
	Dimensions ReportDimensions
	Filters    ReportFilters
}

type ReportRow struct {
	YearLocal                    int       `field:"year_local"`
	MonthLocal                   int       `field:"month_local"`
	ScheduleYear                 int       `field:"schedule_year"`
	IsSummerSchedule             bool      `field:"is_summer_schedule"`
	AirlineId                    uuid.UUID `field:"airline_id"`
	Number                       int       `field:"number"`
	Suffix                       string    `field:"suffix"`
	DepartureAirportId           uuid.UUID `field:"departure_airport_id"`
	ArrivalAirportId             uuid.UUID `field:"arrival_airport_id"`
	AircraftId                   uuid.UUID `field:"aircraft_id"`
	AircraftConfigurationVersion string    `field:"aircraft_configuration_version"`
	IsOperating                  bool      `field:"is_operating"`
	DurationSecondsTrunc5m       int64     `field:"duration_seconds_5m_trunc"`
	Count                        uint64    `field:"count"`
	CountOperating               uint64    `field:"count_operating"`
	MinDurationSeconds           uint64    `field:"min_duration_seconds"`
	MaxDurationSeconds           uint64    `field:"max_duration_seconds"`
	SumDurationSeconds           float64   `field:"sum_duration_seconds"`
	SumDurationSecondsOperating  float64   `field:"sum_duration_seconds_operating"`
}

func (rr *ReportRow) Scan(columns []string, rows *sql.Rows) error {
	fields := make([]any, len(columns))

	rv := reflect.ValueOf(rr).Elem()
	rvt := rv.Type()
	for colIdx, column := range columns {
		found := false
		for fieldIdx := range rvt.NumField() {
			if field, ok := rvt.Field(fieldIdx).Tag.Lookup("field"); ok && field == column {
				fv := rv.Field(fieldIdx)
				if fv.Kind() == reflect.Ptr {
					fields[colIdx] = fv.Interface()
				} else if fv.CanAddr() {
					fields[colIdx] = fv.Addr().Interface()
				} else {
					return fmt.Errorf("field %q is not addressable", column)
				}

				found = true
				break
			}
		}

		if !found {
			return fmt.Errorf("field %q not found in struct", column)
		}
	}

	return rows.Scan(fields...)
}

type ReportRepo struct {
	db reportRepoDatabase
}

func NewReportRepo(db reportRepoDatabase) *ReportRepo {
	return &ReportRepo{db: db}
}

func (rr *ReportRepo) Destinations(ctx context.Context, airportId uuid.UUID) ([]uuid.UUID, error) {
	conn, err := rr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	rows, err := conn.QueryContext(
		ctx,
		`SELECT DISTINCT arrival_airport_id FROM report WHERE departure_airport_id = ?`,
		airportId,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	destinationAirportIds := make([]uuid.UUID, 0)
	for rows.Next() {
		var destinationAirportId uuid.UUID
		if err = rows.Scan(&destinationAirportId); err != nil {
			return nil, err
		}

		destinationAirportIds = append(destinationAirportIds, destinationAirportId)
	}

	return destinationAirportIds, rows.Err()
}

func (rr *ReportRepo) Report(ctx context.Context, request ReportRequest) ([]ReportRow, error) {
	const limit = 100_000

	conn, err := rr.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	groupFields := request.Dimensions.fields()
	groupFieldsStr := strings.Join(groupFields, ",")

	selectFields := append([]string(nil), groupFields...)
	selectFields = append(
		selectFields,
		"SUM(count) AS count",
		"SUM(count) FILTER ( is_operating = true ) AS count_operating",
		"MIN(min_duration_seconds) AS min_duration_seconds",
		"MAX(max_duration_seconds) AS max_duration_seconds",
		"SUM(sum_duration_seconds) AS sum_duration_seconds",
		"SUM(sum_duration_seconds) FILTER ( is_operating = true ) AS sum_duration_seconds_operating",
	)
	selectFieldsStr := strings.Join(selectFields, ",")
	query := fmt.Sprintf("SELECT %s FROM report GROUP BY %s LIMIT ?", selectFieldsStr, groupFieldsStr)

	rows, err := conn.QueryContext(
		ctx,
		query,
		limit+1,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	reportRows := make([]ReportRow, 0)
	for rows.Next() {
		var row ReportRow
		if err = row.Scan(columns, rows); err != nil {
			return nil, err
		}

		reportRows = append(reportRows, row)
	}

	if len(reportRows) > limit {
		return nil, errors.New("too many rows")
	}

	return reportRows, rows.Err()
}
