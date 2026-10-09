import { Emitter } from '../core/emitter';

export type FlowState = 'menu' | 'playing' | 'paused' | 'finished';
export type FlowAction = 'start' | 'pause' | 'resume' | 'restart' | 'quit' | 'finish';

type FlowEvents = { change: { from: FlowState; to: FlowState; action: FlowAction } };

const TRANSITIONS: Record<FlowState, Partial<Record<FlowAction, FlowState>>> = {
  menu: { start: 'playing' },
  playing: { pause: 'paused', finish: 'finished', restart: 'playing', quit: 'menu' },
  paused: { resume: 'playing', restart: 'playing', quit: 'menu' },
  finished: { restart: 'playing', quit: 'menu' },
};

/** Top-level application state machine. Invalid transitions are ignored and reported via the return value. */
export class GameFlow {
  readonly events = new Emitter<FlowEvents>();
  state: FlowState = 'menu';

  can(action: FlowAction): boolean {
    return TRANSITIONS[this.state][action] !== undefined;
  }

  dispatch(action: FlowAction): boolean {
    const to = TRANSITIONS[this.state][action];
    if (!to) return false;
    const from = this.state;
    this.state = to;
    this.events.emit('change', { from, to, action });
    return true;
  }
}
