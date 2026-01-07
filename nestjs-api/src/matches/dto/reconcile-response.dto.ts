import { Candidate } from '../matches.service';

export interface ReconcileResponse {
  candidates: any[];
  byInvoice: Record<number, Candidate[]>;
  byTransaction: Record<number, Candidate[]>;
  message?: string;
}

