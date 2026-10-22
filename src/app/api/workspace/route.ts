import { authenticatedUser,failure,json } from "@/lib/api";
import { snapshot } from "@/lib/repository";
export async function GET() {
  try { await authenticatedUser(); return json(await snapshot()); }
  catch(error) { return failure(error); }
}
