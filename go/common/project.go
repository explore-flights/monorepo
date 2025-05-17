package common

import "time"

func ProjectCreationTime() time.Time {
	return time.Date(2024, time.May, 1, 0, 7, 0, 0, time.FixedZone("UTC+2", int((time.Hour*2).Seconds())))
}
