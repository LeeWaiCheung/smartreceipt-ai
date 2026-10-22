export function isTrialUser(user:{app_metadata?:Record<string,unknown>}):boolean {
  return user.app_metadata?.smartreceipt_guest===true;
}
export function receiptBucket(user:{app_metadata?:Record<string,unknown>}):string {
  return isTrialUser(user)?"trial-receipts":"receipts";
}
