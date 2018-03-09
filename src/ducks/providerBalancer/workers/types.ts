import { AllProviderIds, ProviderCall } from '../providerCalls/types';
import { Task } from 'redux-saga';

export interface IWorker {
  task: Task;
  assignedProvider: AllProviderIds;
  currentPayload: ProviderCall | null;
}

export interface WorkerState {
  [workerId: string]: Readonly<IWorker>;
}

export enum WORKER {
  PROCESSING = 'WORKER_PROCESSING',
  SPAWNED = 'WORKER_SPAWNED',
  KILLED = 'WORKER_KILLED',
}

export interface WorkerSpawnedAction {
  type: WORKER.SPAWNED;
  payload: {
    providerId: AllProviderIds;
    workerId: string;
    task: Task;
  };
}

export interface WorkerProcessingAction {
  type: WORKER.PROCESSING;
  payload: {
    workerId: string;
    currentPayload: ProviderCall;
  };
}

export interface WorkerKilledAction {
  type: WORKER.KILLED;
  payload: {
    providerId: AllProviderIds;
    workerId: string;
    error: Error;
  };
}

export type WorkerAction =
  | WorkerSpawnedAction
  | WorkerProcessingAction
  | WorkerKilledAction;