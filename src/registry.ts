// Tracks which connected subscribers listen on which channels, in-process.
// A subscriber is any object with an id + channel set; the WS gateway supplies
// live sockets, but tests can supply plain objects.
export interface Subscriber {
  id: string;
  channels: Set<string>;
}

export class SubscriptionRegistry<S extends Subscriber = Subscriber> {
  private byId = new Map<string, S>();
  private byChannel = new Map<string, Set<S>>();

  add(sub: S): void {
    this.byId.set(sub.id, sub);
    for (const channel of sub.channels) this.index(channel, sub);
  }

  remove(id: string): void {
    const sub = this.byId.get(id);
    if (!sub) return;
    this.byId.delete(id);
    for (const channel of sub.channels) {
      const set = this.byChannel.get(channel);
      set?.delete(sub);
      if (set && set.size === 0) this.byChannel.delete(channel);
    }
  }

  subscribe(id: string, channel: string): void {
    const sub = this.byId.get(id);
    if (!sub) return;
    sub.channels.add(channel);
    this.index(channel, sub);
  }

  unsubscribe(id: string, channel: string): void {
    const sub = this.byId.get(id);
    if (!sub) return;
    sub.channels.delete(channel);
    const set = this.byChannel.get(channel);
    set?.delete(sub);
    if (set && set.size === 0) this.byChannel.delete(channel);
  }

  subscribersFor(channel: string): S[] {
    return [...(this.byChannel.get(channel) ?? [])];
  }

  get size(): number {
    return this.byId.size;
  }

  private index(channel: string, sub: S): void {
    let set = this.byChannel.get(channel);
    if (!set) {
      set = new Set<S>();
      this.byChannel.set(channel, set);
    }
    set.add(sub);
  }
}
