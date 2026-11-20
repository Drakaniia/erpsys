const leases = new Set<string>();

export function registerEditLease(leaseId: string): () => void {
  leases.add(leaseId);
  return () => { leases.delete(leaseId); };
}

export function editLeaseHeader(): string {
  return JSON.stringify([...leases]);
}
