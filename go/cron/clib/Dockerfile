FROM amazonlinux:2023 AS build
ADD "https://github.com/duckdb/duckdb/releases/download/v1.2.2/duckdb_cli-linux-aarch64.zip" duckdb.zip
RUN yum install -y unzip && unzip duckdb.zip && rm duckdb.zip
RUN mkdir duckdb_extensions && ./duckdb -c "SET extension_directory = '/duckdb_extensions'; INSTALL aws; INSTALL httpfs; INSTALL json; INSTALL icu;"

FROM scratch
COPY --from=build /duckdb_extensions /