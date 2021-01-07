FROM rust as build

RUN rustup default nightly
COPY . .
RUN cargo build -Z unstable-options --out-dir out/ --release

FROM debian:buster-slim
COPY --from=build out/signaler .
EXPOSE 8000
CMD ["./signaler"]
