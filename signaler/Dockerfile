FROM rust as build

RUN rustup default nightly
COPY . .
RUN cargo build -Z unstable-options --out-dir out/ --release

FROM debian:slim
COPY --from=build out/pwnd_signaler .
CMD ["./pwnd_signaler"]
