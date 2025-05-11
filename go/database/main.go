package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	var (
		t                   time.Time
		databaseBucket      string
		fullDatabaseKey     string
		baseDataDatabaseKey string
		parquetBucket       string
		variantsKey         string
		historyPrefix       string
		latestPrefix        string
		inputBucket         string
		inputPrefix         string
		dateRangesJSON      string
		dateRanges          xtime.LocalDateRanges
	)

	fs := flag.NewFlagSet("", flag.PanicOnError)
	fs.TextVar(&t, "time", time.Now(), "")
	fs.StringVar(&databaseBucket, "database-bucket", "", "")
	fs.StringVar(&fullDatabaseKey, "full-database-key", "", "")
	fs.StringVar(&baseDataDatabaseKey, "basedata-database-key", "", "")
	fs.StringVar(&parquetBucket, "parquet-bucket", "", "")
	fs.StringVar(&variantsKey, "variants-key", "", "")
	fs.StringVar(&historyPrefix, "history-prefix", "", "")
	fs.StringVar(&latestPrefix, "latest-prefix", "", "")
	fs.StringVar(&inputBucket, "input-bucket", "", "")
	fs.StringVar(&inputPrefix, "input-prefix", "", "")
	fs.StringVar(&dateRangesJSON, "date-ranges-json", "", "")
	fs.SetOutput(os.Stdout)

	if err := fs.Parse(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fs.Usage()
			os.Exit(0)
		} else {
			log.Fatal(err)
		}
		return
	}

	if err := json.Unmarshal([]byte(dateRangesJSON), &dateRanges); err != nil {
		log.Fatal(err)
		return
	}

	if t.IsZero() ||
		databaseBucket == "" ||
		fullDatabaseKey == "" ||
		baseDataDatabaseKey == "" ||
		parquetBucket == "" ||
		variantsKey == "" ||
		historyPrefix == "" ||
		latestPrefix == "" ||
		inputBucket == "" ||
		inputPrefix == "" {

		log.Fatal("missing input argument")
		return
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatalf("failed to load AWS config: %v", err)
		return
	}

	u := updater{
		s3c:                  s3.NewFromConfig(cfg),
		parquetFileUriSchema: "s3",
		inputFileUriSchema:   "s3",
	}

	if err = u.UpdateDatabase(ctx, t, databaseBucket, fullDatabaseKey, baseDataDatabaseKey, parquetBucket, variantsKey, historyPrefix, latestPrefix, inputBucket, inputPrefix, dateRanges); err != nil {
		log.Fatal(err)
		return
	}
}
