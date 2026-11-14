package model

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/jxskiss/base62"
)

func TestContinuation96BitRoundTrip(t *testing.T) {
	for _, after := range []ConnectionsContinuation{
		{Departure: time.UnixMilli(0).UTC()},
		{Departure: time.UnixMilli(-1234).UTC(), Consumed: 1},
		{Departure: time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC), Consumed: math.MaxUint32},
	} {
		token := after.String()
		data, err := base62.DecodeString(token)
		if err != nil || len(data) != 12 || int64(binary.BigEndian.Uint64(data[:8])) != after.Departure.UnixMilli() || binary.BigEndian.Uint32(data[8:]) != after.Consumed {
			t.Fatalf("payload=%x error=%v", data, err)
		}
		var restored ConnectionsContinuation
		if err := restored.FromString(token); err != nil || !reflect.DeepEqual(restored, after) {
			t.Fatalf("%+v %v", restored, err)
		}
		encoded, err := json.Marshal(after)
		if err != nil || string(encoded) != `"`+token+`"` {
			t.Fatalf("JSON=%s error=%v", encoded, err)
		}
		if err := json.Unmarshal(encoded, &restored); err != nil || !reflect.DeepEqual(restored, after) {
			t.Fatalf("JSON roundtrip: %+v %v", restored, err)
		}
		text, err := after.MarshalText()
		if err != nil {
			t.Fatal(err)
		}
		if err := restored.UnmarshalText(text); err != nil || !reflect.DeepEqual(restored, after) {
			t.Fatalf("text roundtrip: %+v %v", restored, err)
		}
	}
	for _, token := range []string{"", "!", base62.EncodeToString(make([]byte, 11)), base62.EncodeToString(make([]byte, 13))} {
		var value ConnectionsContinuation
		if err := value.FromString(token); err == nil {
			t.Fatalf("accepted %q", token)
		}
	}
}
