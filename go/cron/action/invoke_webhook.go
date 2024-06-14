package action

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/url"
	"strings"
)

type InvokeWebhookBody struct {
	Content  string `json:"content"`
	IsBase64 bool   `json:"isBase64"`
}

type InvokeWebhookParams struct {
	Method string             `json:"method"`
	URL    string             `json:"url"`
	Header http.Header        `json:"header"`
	Query  url.Values         `json:"query"`
	Body   *InvokeWebhookBody `json:"body,omitempty"`
}

func (p InvokeWebhookParams) body() io.Reader {
	if p.Body == nil {
		return nil
	}

	r := strings.NewReader(p.Body.Content)
	if !p.Body.IsBase64 {
		return r
	}

	return base64.NewDecoder(base64.StdEncoding, r)
}

type InvokeWebhookOutput struct {
	StatusCode int               `json:"statusCode"`
	Status     string            `json:"status"`
	Header     http.Header       `json:"header"`
	Body       InvokeWebhookBody `json:"body"`
}

type invWHAction struct {
	httpClient *http.Client
}

func NewInvokeWebhookAction(httpClient *http.Client) Action[InvokeWebhookParams, InvokeWebhookOutput] {
	return &invWHAction{httpClient}
}

func (a *invWHAction) Handle(ctx context.Context, params InvokeWebhookParams) (InvokeWebhookOutput, error) {
	req, err := http.NewRequestWithContext(ctx, params.Method, params.URL, params.body())
	if err != nil {
		return InvokeWebhookOutput{}, err
	}

	q := req.URL.Query()
	for k, v := range params.Query {
		for _, vv := range v {
			q.Add(k, vv)
		}
	}

	req.URL.RawQuery = q.Encode()
	req.Header = params.Header

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return InvokeWebhookOutput{}, err
	}

	defer resp.Body.Close()

	var b bytes.Buffer
	wc := base64.NewEncoder(base64.StdEncoding, &b)
	if _, err = io.Copy(wc, resp.Body); err != nil {
		return InvokeWebhookOutput{}, err
	}

	_ = wc.Close()

	return InvokeWebhookOutput{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		Header:     resp.Header,
		Body: InvokeWebhookBody{
			Content:  b.String(),
			IsBase64: true,
		},
	}, nil
}
