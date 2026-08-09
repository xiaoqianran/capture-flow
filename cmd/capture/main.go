package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/xiaoqianran/capture-flow/internal/domain"
)

func main() {
	hub := flag.String("hub", "http://127.0.0.1:8080", "hub base URL")
	wait := flag.Duration("wait", 3*time.Minute, "max wait for job completion")
	poll := flag.Duration("poll", 500*time.Millisecond, "poll interval")
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		usage()
		os.Exit(2)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	base := strings.TrimRight(*hub, "/")

	switch args[0] {
	case "job":
		if len(args) < 2 {
			fail("usage: capture job <job_id>")
		}
		job, err := getJSON[domain.Job](client, base+"/jobs/"+args[1])
		must(err)
		printJSON(job)
	case "doc":
		if len(args) < 2 {
			fail("usage: capture doc <document_id>")
		}
		doc, err := getJSON[domain.ContentPacket](client, base+"/docs/"+args[1])
		must(err)
		printJSON(doc)
	case "health":
		raw, err := getRaw(client, base+"/health")
		must(err)
		fmt.Println(string(raw))
	default:
		// capture <url> [task]
		url := args[0]
		task := "full_text"
		if len(args) >= 2 {
			task = args[1]
		}
		job, err := createJob(client, base, url, task)
		must(err)
		fmt.Fprintf(os.Stderr, "job %s queued → polling %s\n", job.ID, base)

		done, err := waitJob(client, base, job.ID, *wait, *poll)
		must(err)
		printJSON(done)
		if done.Status == domain.JobFailed {
			os.Exit(1)
		}
		if done.DocumentID != "" {
			doc, err := getJSON[domain.ContentPacket](client, base+"/docs/"+done.DocumentID)
			if err == nil {
				fmt.Fprintln(os.Stderr, "--- document ---")
				printJSON(doc)
			}
		}
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `capture-flow client

Usage:
  capture [flags] <url> [task]   Submit capture job and wait
  capture [flags] job <id>       Show job JSON
  capture [flags] doc <id>       Show ContentPacket JSON
  capture [flags] health         Hub health

Flags:
  -hub string     Hub base URL (default http://127.0.0.1:8080)
  -wait duration  Max wait (default 3m)
  -poll duration  Poll interval (default 500ms)
`)
}

func createJob(client *http.Client, base, url, task string) (*domain.Job, error) {
	body, _ := json.Marshal(domain.CreateJobRequest{URL: url, Task: task})
	req, err := http.NewRequest(http.MethodPost, base+"/jobs", strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("POST /jobs %s: %s", resp.Status, string(raw))
	}
	var job domain.Job
	if err := json.Unmarshal(raw, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

func waitJob(client *http.Client, base, id string, maxWait, interval time.Duration) (*domain.Job, error) {
	deadline := time.Now().Add(maxWait)
	for {
		job, err := getJSON[domain.Job](client, base+"/jobs/"+id)
		if err != nil {
			return nil, err
		}
		if job.Status.IsTerminal() {
			return job, nil
		}
		if time.Now().After(deadline) {
			return job, fmt.Errorf("timeout waiting for job %s (status=%s)", id, job.Status)
		}
		time.Sleep(interval)
	}
}

func getJSON[T any](client *http.Client, url string) (*T, error) {
	raw, err := getRaw(client, url)
	if err != nil {
		return nil, err
	}
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, err
	}
	return &v, nil
}

func getRaw(client *http.Client, url string) ([]byte, error) {
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GET %s: %s: %s", url, resp.Status, string(raw))
	}
	return raw, nil
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func must(err error) {
	if err != nil {
		fail(err.Error())
	}
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}
