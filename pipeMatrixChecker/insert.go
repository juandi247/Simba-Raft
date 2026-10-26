package main

import (
	"database/sql"
	"fmt"
	"math/rand"
	"time"
)

const seedMaxRange = 999_999
const maxSeeds = 10_000

func insertScript(db *sql.DB) {
	fuzzLevels := [3]string{"low", "medium", "high"}

	for i := range maxSeeds {
		seed := 1 + rand.Intn(seedMaxRange-1)
		randomFuzzLevel := rand.Intn(len(fuzzLevels))

		_, err := db.Exec("INSERT INTO simulations (Seed, FuzzLevel) VALUES (?, ?)", seed, fuzzLevels[randomFuzzLevel])
		if err != nil {
			fmt.Println("error insert: ", err, i)
			continue
		}
		fmt.Println("inserted seed: ", seed)
		time.Sleep(500 * time.Millisecond)

	}

}
