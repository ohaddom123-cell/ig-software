import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, historicalPosts, postingSchedules } from "@/db/schema";
import { ClientEditor } from "./ClientEditor";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) notFound();

  const schedules = await db
    .select()
    .from(postingSchedules)
    .where(eq(postingSchedules.clientId, id));

  const history = await db
    .select()
    .from(historicalPosts)
    .where(eq(historicalPosts.clientId, id))
    .orderBy(desc(historicalPosts.publishedAt))
    .limit(50);

  return <ClientEditor client={client} schedules={schedules} history={history} />;
}
