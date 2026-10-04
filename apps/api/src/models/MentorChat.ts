import { Schema, model } from "mongoose";

export interface SourceRef {
  n: number;
  title: string;
  page: number;
  snippet: string;
}

const sourceSchema = new Schema(
  {
    n: Number,
    title: String,
    page: Number,
    snippet: String,
  },
  { _id: false },
);

const mentorChatSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    domain: { type: String, required: true },
    messages: {
      type: [
        new Schema(
          {
            role: { type: String, enum: ["user", "assistant"], required: true },
            content: { type: String, required: true },
            sources: { type: [sourceSchema], default: [] },
            /** True when the material did not cover the question and no model was called. */
            refused: { type: Boolean, default: false },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);
mentorChatSchema.index({ userId: 1, domain: 1 }, { unique: true });

export const MentorChat = model("MentorChat", mentorChatSchema);

export const MAX_STORED_MESSAGES = 200;

export function toMessageDto(m: unknown) {
  const x = m as {
    role: "user" | "assistant";
    content: string;
    sources?: SourceRef[];
    refused?: boolean;
    createdAt: Date;
  };
  return {
    role: x.role,
    content: x.content,
    sources: (x.sources ?? []).map((s) => ({
      n: s.n,
      title: s.title,
      page: s.page,
      snippet: s.snippet,
    })),
    refused: Boolean(x.refused),
    createdAt: x.createdAt.toISOString(),
  };
}
