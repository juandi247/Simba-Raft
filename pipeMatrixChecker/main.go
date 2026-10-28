package main

import (
	"bufio"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

/*
----TABLE ---
    Seed INTEGER PRIMARY KEY,
    FuzzLevel TEXT NOT NULL,
    RunState TEXT,
    PanicOutput TEXT


QUERIES: 
 SELECT count(*) from simulations WHERE RunState="SUCCESFULL";
 SELECT count(*) from simulations WHERE RunState="FAILED";
 SELECT count(*) from simulations WHERE RunState is NULL;

SELECT * from simulations WHERE RunState="FAILED";


UPDATE simulations SET RunState=NULL PanicOutput=NULL;

*/

const MAXTICKS = 200_000
const simulatorAppPath = `.\simba-1.0.3.exe`
const WORKERSNUMBER = 6

func main() {


 db, err:= sql.Open("sqlite3", "checker.db")

 if err!=nil{
 	fmt.Println("error opening db: ",  err)
 	return
 }
	fmt.Println("connected to SQL Lite")
	fmt.Println("Using exe: ", simulatorAppPath)
	
	 defer db.Close()

	ctx := context.Background()
	ctx, cancelFunc := context.WithCancel(ctx)

	eventChan:= make(chan simulationData, WORKERSNUMBER)

	var wg sync.WaitGroup

	wg.Add(1)
	fmt.Println("creaitng dispatch")
	go dispatch(db, ctx, eventChan, cancelFunc, &wg)


	for i:= range WORKERSNUMBER{
		wg.Add(1)
		fmt.Println("creating worker: ", i+1 )
		go worker(db,ctx, eventChan, &wg)
	}


	wg.Wait()
	close(eventChan)
	fmt.Println("Program ended gracefully")

}

func newSimDataSlice(rows *sql.Rows) ([]simulationData, error){

	//WE NOW its going to be less than 5000 
	data:= make([]simulationData,0, 1200)

	for rows.Next() {
				var simValue simulationData
				err := rows.Scan(&simValue.seed, &simValue.fuzzyLevel, &simValue.runState, &simValue.panicOutput)
				if err != nil {
					return nil, fmt.Errorf("error running query from dispatch: %w", err)
				}

				if simValue.runState.Valid{
				return nil, fmt.Errorf("SEED: %d error el runstate es invalido: %s", simValue.seed, simValue.runState.String)
				}

				if simValue.panicOutput.Valid{
				return nil, fmt.Errorf("SEED: %d error el panicoutput es invalido: %s",simValue.seed, simValue.runState.String)

				}

				data = append(data, simValue)
		
	}

	return data, nil

}


func dispatch(db *sql.DB, ctx context.Context, eventChan chan simulationData, cancel context.CancelFunc, wg *sync.WaitGroup) {
	defer wg.Done()
	defer cancel()

	rows, err := db.Query("SELECT * from simulations WHERE RunState is NULL")

	if err != nil {
		fmt.Println("error running query from dispatch: ", err)
		return
	}

	simDataSlice, err:= newSimDataSlice(rows)

	if err != nil {
		fmt.Println("Error creando el slice de datos de las rows: ", err)
		return
	}




	for _, simValue := range simDataSlice{
		select {
		case <-ctx.Done():
			fmt.Println("shutting down dispatch")
			return
		default:
				_, err = db.Exec("UPDATE simulations SET RunState = ? WHERE Seed = ?; ", "RUNNING", simValue.seed)
				if err != nil {
					fmt.Println("error updating runstate: ", err)
					return
				}
				eventChan <- simValue
			}
		}


}

type simulationData struct {
	seed       int
	fuzzyLevel string
	runState sql.NullString
	panicOutput sql.NullString
}

func worker(db *sql.DB, ctx context.Context, eventChan chan simulationData, wg *sync.WaitGroup) {
	defer wg.Done()

	for {
		select {

		case <-ctx.Done():
			fmt.Println("shutting down worker")
			return
		case simData := <-eventChan:
			fmt.Println("starting seed check: ", simData.seed)

			if simData.seed == 0 || simData.fuzzyLevel == ""{
				fmt.Printf("invalid seed data: %d or fuzzlevel: %s \n", simData.seed, simData.fuzzyLevel)
				return
			}

			err := runSimulator(simData.seed, simData.fuzzyLevel)
			if err != nil {
				var simulatorPanicError *SimulatorPanicError
				isPanic := errors.As(err, &simulatorPanicError)

				if isPanic {
					handleSimbaPanic(db, simData.seed, err.Error())
				} else {
					fmt.Println("error on simulator non-valid: ", err)
				}
				fmt.Printf("Seed %v tested FAILED \n", simData.seed)
				continue
			}

			//HAPY PATH
			_, err = db.Exec("UPDATE simulations SET RunState = ? WHERE Seed = ?; ", "SUCCESFULL", simData.seed)
		
			if err != nil {
				fmt.Println("error updating runstate: ", err)
			}

			fmt.Printf("Seed %v tested SUCCESFULLY \n", simData.seed)

		}

	}

}

func handleSimbaPanic(db *sql.DB, seed int, panicOutput string) {
	_, err := db.Exec("UPDATE simulations SET RunState = ?,PanicOutput = ?  WHERE Seed = ?;",
		"FAILED",
		panicOutput,
		seed)

	if err != nil {
		fmt.Println("error updating runstate: ", err)
	}

}

func runSimulator(seed int, fuzzLevel string) error {

	command := fmt.Sprintf("%s -mode M -maxticks %d -seed %d -fuzzylevel %s", simulatorAppPath, MAXTICKS, seed, fuzzLevel)

	separatedCommand := strings.Fields(command)

	cmd := exec.Command(separatedCommand[0], separatedCommand[1:]...)

	readCloser, err := cmd.StderrPipe()
	if err != nil {
		fmt.Println("error with stdoutPipe:", err)
		return err
	}
	defer readCloser.Close()

	fmt.Println("corriendo simba ")
	if err := cmd.Start(); err != nil {
		fmt.Println("error running cmd: ", err)
		return err
	}

	scanner := bufio.NewScanner(readCloser)

	var builder strings.Builder
	for scanner.Scan() {
		builder.WriteString(scanner.Text())
		fmt.Println(scanner.Text())
	}

	cmd.Wait()

	stdErrorPiped := builder.String()

	//NOTE: we got a panic on the SIMBA simulation
	if len(stdErrorPiped) > 0 {
		return &SimulatorPanicError{
			message: stdErrorPiped,
		}
	}

	return nil
}

type SimulatorPanicError struct {
	message string
}

func (s *SimulatorPanicError) Error() string {
	return s.message

}
