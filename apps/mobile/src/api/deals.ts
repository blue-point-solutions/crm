import client from "./client";

export type DealStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export interface DealTransition {
  key: string;
  toStage: DealStage;
  label: string;
}

export interface Deal {
  id: string;
  contactId: string;
  contactName: string;
  title: string;
  value: number;
  stage: DealStage;
  stageLabel: string;
  status: "open" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  /** Exactly the legal next moves — render these, nothing else. */
  allowedTransitions: DealTransition[];
}

export interface DealListResponse {
  items: Deal[];
  total: number;
}

export interface PipelineStage {
  key: DealStage;
  label: string;
  count: number;
  value: number;
}

export interface PipelineBoard {
  stages: PipelineStage[];
  totalOpenCount: number;
  totalOpenValue: number;
  wonCount: number;
  lostCount: number;
}

export async function createDeal(
  contactId: string,
  title: string,
  value: number
): Promise<Deal> {
  const { data } = await client.post<Deal>("/deals", { contactId, title, value });
  return data;
}

export async function listDeals(params?: {
  stage?: DealStage;
  contactId?: string;
  status?: "open" | "completed";
}): Promise<DealListResponse> {
  const { data } = await client.get<DealListResponse>("/deals", { params });
  return data;
}

export async function advanceDeal(
  dealId: string,
  toStage: DealStage,
  note?: string
): Promise<Deal> {
  const { data } = await client.post<Deal>(`/deals/${dealId}/advance`, {
    toStage,
    ...(note ? { note } : {}),
  });
  return data;
}

export async function getPipeline(): Promise<PipelineBoard> {
  const { data } = await client.get<PipelineBoard>("/pipeline");
  return data;
}
