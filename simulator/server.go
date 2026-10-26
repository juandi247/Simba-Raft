package simulator

import (
	"net/http"
)

/*
create the http server just for the UI
Also flusher for SSE on the handlers
*/

type HttpServer struct {
	muxer     *http.ServeMux
	port      string
	startFunc func() error
	// RequestTimeout time
	useHTTPS bool
	certFile string
	keyFile  string
}

func NewServer(port string, useHTTPS bool) *HttpServer {

	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("hola :) "))
	})

	s := &HttpServer{
		muxer:    mux,
		port:     ":" + port,
		useHTTPS: useHTTPS,
	}

	if useHTTPS {
		s.certFile = "/etc/letsencrypt/live/skipper.lat/fullchain.pem" // Ruta del certificado
		s.keyFile = "/etc/letsencrypt/live/skipper.lat/privkey.pem"    // Ruta de la clave privada
	}

	return s

}

func (s *HttpServer) StartServer() error {
	if s.useHTTPS {
		return http.ListenAndServeTLS(s.port, s.certFile, s.keyFile, s.muxer)
	}
	return http.ListenAndServe(s.port, s.muxer)
}
