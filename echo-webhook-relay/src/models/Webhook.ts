export class Webhook {
  id: string;
  url: string;
  method: string;
  headers: { [key: string]: string };
  body: string;

  constructor(id: string, url: string, method: string, headers: { [key: string]: string }, body: string) {
    this.id = id;
    this.url = url;
    this.method = method;
    this.headers = headers;
    this.body = body;
  }
}