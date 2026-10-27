# Simba 🐱

**A single-threaded implementation of Raft, tested with deterministic simulation.**

Simba is a personal project built to learn how [Raft](https://raft.github.io/) works, help others explore distributed consensus, and test my own implementation using **Deterministic Simulation Testing (DST)**.

The same Raft implementation can run inside a deterministic simulator or, by abstracting time and networking, in a real environment. This makes it possible to reproduce failures, explore edge cases, and test distributed behavior without relying on real time or a real network.

## How it works

Simba separates the Raft logic from its environment through interfaces, mainly for time and networking.

It has three execution modes:

- **Visualization mode (`V`)** — Starts a web server to visualize simulations in real time.
- **Matrix mode (`M`)** — Runs deterministic simulations without a web interface.
- **Real mode (`R`)** — Intended to run the same Raft implementation with real time, networking, and storage across multiple machines.

In Matrix mode, time is a counter and network messages are simulated events. A seed controls the simulation, allowing the same execution to be reproduced.

The goal is simple: **test Raft in a controlled environment before running it in the real world.**

## Getting started

### Requirements

- [Go](https://go.dev/dl/) installed.
- Git installed.

### Clone the repository

```bash
git clone https://github.com/juandi247/Matrix-Raft.git
cd Matrix-Raft
```

## Running Simba

### 1. Visualization mode

Start the web server to visualize simulations through your browser.

```bash
go run . -mode V
```

By default, the server uses port `8080`.

To use a different port:

```bash
go run . -mode V -port 8090
```

Open `http://localhost:8080` in your browser, or use the port you selected.

For HTTPS, provide a certificate and a private key:

```bash
go run . -mode V -https \
  -certfile ./cert.pem \
  -keyfile ./key.pem
```

### 2. Matrix mode

Run a deterministic simulation directly from the terminal.

```bash
go run . -mode M -seed 1234
```

You can control the simulation seed, maximum number of ticks, and fault injection level.

```bash
go run . -mode M \
  -seed 1234 \
  -maxticks 100000 \
  -fuzzylevel medium
```

Available fault injection levels:

| Level | Description |
|---|---|
| `low` | Lower probability of network faults |
| `medium` | More frequent network faults |
| `high` | Higher probability of network faults |

The simulator can introduce network latency, duplicate or lost messages, and node crashes. The same seed and configuration allow you to reproduce the same run.

Time is simulated, so the cluster can advance much faster than real time. The maximum number of ticks determines how long the simulation runs.

**Note:** A non-zero seed is required by the current implementation.

### 3. Real mode

The goal of Real mode is to run the same Raft implementation across multiple VPS instances using real networking, timeouts, and persistent storage.

This mode is intended to demonstrate that the Raft logic tested in the simulator can also operate in a real distributed environment.

The `R` mode is reserved in the current entry point; its startup implementation and deployment instructions will be added as this part of the project develops.

## Deterministic Simulation Testing

Distributed systems are difficult to debug because failures often depend on timing and message delivery.

Simba uses deterministic simulation to make those failures easier to reproduce.

- **Controlled time:** Time advances through simulation ticks instead of wall-clock time.
- **Simulated network:** Messages are delivered through an event queue.
- **Fault injection:** Introduce latency, message loss, duplication, and node crashes.
- **Reproducible runs:** Use a seed to replay the same simulation.
- **Fast execution:** Simulate long periods of cluster activity without waiting for real time.

## Project goals

- Learn and understand the Raft consensus algorithm.
- Make Raft easier to explore and visualize.
- Experiment with distributed system failures.
- Test my implementation using deterministic simulation.
- Work toward running the same implementation in a real distributed environment.

Simba 🐱 is a learning project, built to explore how distributed consensus works and how deterministic testing can make it easier to understand and debug.

## Contact

- GitHub: [@juandi247](https://github.com/juandi247)
- LinkedIn: [Juan Diego Díaz Acevedo](https://www.linkedin.com/in/juandiegodiazacevedo/)
- Email: [juand.diazac@gmail.com](mailto:juand.diazac@gmail.com)
