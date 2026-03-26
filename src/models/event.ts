export class Event {
  id: string;
  type: string;
  payload: any;

  constructor(data: any) {
    this.id = data.id;
    this.type = data.type;
    this.payload = data.payload;
  }
}