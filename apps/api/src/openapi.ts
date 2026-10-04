const slugParam = [{ name: "slug", in: "path", required: true, schema: { type: "string" } }];
const err = {
  description: "Error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};
const ok = (ref: string) => ({
  description: "OK",
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});
const json = (ref: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

export const openapi = {
  openapi: "3.0.3",
  info: { title: "Smart Learning & Placement API", version: "0.1.0" },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "slp_access" },
      bearerAuth: { type: "http", scheme: "bearer" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
              requestId: { type: "string" },
            },
          },
        },
      },
      Register: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, maxLength: 72 },
        },
      },
      Login: {
        type: "object",
        required: ["email", "password"],
        properties: { email: { type: "string" }, password: { type: "string" } },
      },
      UserResponse: {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              email: { type: "string" },
              role: { type: "string", enum: ["student", "mentor", "admin"] },
              createdAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
      ProfileUpdate: {
        type: "object",
        properties: {
          education: { type: "array", items: { type: "object" } },
          skills: { type: "array", items: { type: "string" } },
          interests: { type: "array", items: { type: "string" } },
        },
      },
      ProfileResponse: { type: "object", properties: { profile: { type: "object" } } },
      SelectDomain: {
        type: "object",
        required: ["slug"],
        properties: { slug: { type: "string" } },
      },
      DomainConfig: {
        type: "object",
        required: [
          "name",
          "description",
          "benchmarkSkills",
          "assessmentTypes",
          "mockEvaluation",
          "readinessTarget",
          "opportunityTypes",
        ],
        properties: {
          slug: { type: "string", description: "Required on create; not accepted on update" },
          name: { type: "string" },
          description: { type: "string" },
          benchmarkSkills: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                level: { type: "integer", minimum: 1, maximum: 5 },
                weight: { type: "number" },
                category: { type: "string", enum: ["core", "skill", "knowledge", "tool"] },
                source: { type: "string", enum: ["curated", "onet"] },
              },
            },
          },
          assessmentTypes: { type: "array", items: { type: "string" } },
          mockEvaluation: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["interview", "practical-task"] },
              rubric: { type: "array", items: { type: "object" } },
            },
          },
          readinessTarget: { type: "number" },
          opportunityTypes: { type: "array", items: { type: "string" } },
          examCalendar: { type: "array", items: { type: "object" } },
          safetyNotice: { type: "string" },
          isActive: { type: "boolean" },
        },
      },
      DomainResponse: {
        type: "object",
        properties: { domain: { $ref: "#/components/schemas/DomainConfig" } },
      },
      DomainListResponse: {
        type: "object",
        properties: { domains: { type: "array", items: { type: "object" } } },
      },
    },
  },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["auth"],
        security: [],
        requestBody: json("Register"),
        responses: { 201: ok("UserResponse"), 400: err, 409: err },
      },
    },
    "/auth/login": {
      post: {
        tags: ["auth"],
        security: [],
        requestBody: json("Login"),
        responses: { 200: ok("UserResponse"), 401: err },
      },
    },
    "/auth/refresh": {
      post: { tags: ["auth"], security: [], responses: { 200: ok("UserResponse"), 401: err } },
    },
    "/auth/logout": {
      post: { tags: ["auth"], security: [], responses: { 204: { description: "Logged out" } } },
    },
    "/auth/me": { get: { tags: ["auth"], responses: { 200: ok("UserResponse"), 401: err } } },
    "/profile": {
      get: { tags: ["profile"], responses: { 200: ok("ProfileResponse"), 401: err } },
      put: {
        tags: ["profile"],
        requestBody: json("ProfileUpdate"),
        responses: { 200: ok("ProfileResponse"), 400: err },
      },
    },
    "/profile/resume": {
      post: {
        tags: ["profile"],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: { resume: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: { 200: ok("ProfileResponse"), 413: err, 415: err, 422: err },
      },
      delete: { tags: ["profile"], responses: { 200: ok("ProfileResponse") } },
    },
    "/profile/resume/file": {
      get: { tags: ["profile"], responses: { 200: { description: "PDF" }, 404: err } },
    },
    "/profile/domain": {
      put: {
        tags: ["profile"],
        summary: "Choose (or switch) the active career domain",
        requestBody: json("SelectDomain"),
        responses: { 200: ok("ProfileResponse"), 400: err, 404: err },
      },
    },
    "/discovery/quiz": {
      get: {
        tags: ["ai"],
        summary: "The career-discovery quiz (served from data/seeds/discovery_quiz.json)",
        responses: { 200: { description: "Quiz definition" } },
      },
    },
    "/discovery/result": {
      get: {
        tags: ["ai"],
        summary: "Your saved discovery result",
        responses: { 200: { description: "Result" }, 404: err },
      },
      post: {
        tags: ["ai"],
        summary:
          "Submit quiz answers; the LLM recommends the top 3 domains. Rate limited per user.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  answers: {
                    type: "object",
                    additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }] },
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Result" }, 400: err, 429: err, 502: err, 503: err },
      },
    },
    "/skill-gap/generate": {
      post: {
        tags: ["ai"],
        summary:
          "Compare your profile and resume with your active domain's benchmark. Rate limited per user.",
        responses: { 201: { description: "Report" }, 409: err, 422: err, 429: err, 502: err },
      },
    },
    "/skill-gap/latest": {
      get: {
        tags: ["ai"],
        responses: { 200: { description: "Latest report" }, 404: err, 409: err },
      },
    },
    "/learning-path/generate": {
      post: {
        tags: ["ai"],
        summary:
          "Generate a week-by-week plan from your latest skill-gap report. Rate limited per user.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  weeks: { type: "integer", minimum: 2, maximum: 16, default: 8 },
                  hoursPerWeek: { type: "integer", minimum: 1, maximum: 40, default: 8 },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Plan" }, 400: err, 409: err, 422: err, 429: err },
      },
    },
    "/learning-path": {
      get: {
        tags: ["ai"],
        summary: "Latest plan for your active domain",
        responses: { 200: { description: "Plan" }, 404: err },
      },
    },
    "/learning-path/progress": {
      patch: {
        tags: ["ai"],
        summary: "Tick or untick a goal; week status and completion follow",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["week", "goalIndex", "done"],
                properties: {
                  week: { type: "integer" },
                  goalIndex: { type: "integer" },
                  done: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Updated plan" }, 400: err, 404: err },
      },
    },
    "/mentor/chat": {
      post: {
        tags: ["ai"],
        summary:
          "Ask the RAG mentor. Streams server-sent events: sources, then token events, then done (or error). Answers come only from the active domain's study material; if it does not cover the question the reply is a fixed refusal and no model is called.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: { message: { type: "string", maxLength: 1000 } },
              },
            },
          },
        },
        responses: {
          200: { description: "text/event-stream" },
          400: err,
          409: err,
          429: err,
        },
      },
    },
    "/mentor/history": {
      get: { tags: ["ai"], responses: { 200: { description: "Saved conversation" } } },
      delete: { tags: ["ai"], responses: { 204: { description: "Cleared" } } },
    },
    "/mentor/status": {
      get: {
        tags: ["ai"],
        summary: "How much study material the active domain has",
        responses: { 200: { description: "Counts" } },
      },
    },
    "/admin/study-material": {
      get: {
        tags: ["admin"],
        summary: "List study material (admin)",
        parameters: [{ name: "domain", in: "query", schema: { type: "string" } }],
        responses: { 200: { description: "Materials" } },
      },
      post: {
        tags: ["admin"],
        summary:
          "Upload a PDF (admin). It is chunked per page, embedded and indexed. Title, source and license are required.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["domain", "title", "source", "license", "file"],
                properties: {
                  domain: { type: "string" },
                  title: { type: "string" },
                  source: { type: "string" },
                  license: { type: "string" },
                  file: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Indexed" }, 400: err, 415: err, 422: err, 503: err },
      },
    },
    "/admin/study-material/{id}": {
      delete: {
        tags: ["admin"],
        summary: "Delete a document and its passages (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 204: { description: "Deleted" }, 404: err },
      },
    },
    "/features": {
      get: {
        tags: ["system"],
        security: [],
        summary: "Public feature flags (voice interviews are off)",
        responses: { 200: { description: "{ features: { voice: false } }" } },
      },
    },
    "/admin/assessments/generate": {
      post: {
        tags: ["admin"],
        summary:
          "Generate a DRAFT assessment with the LLM (admin). Grounded in study material when the domain has some. Students never see drafts.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain"],
                properties: {
                  domain: { type: "string" },
                  type: { type: "string" },
                  count: { type: "integer", minimum: 3, maximum: 15, default: 8 },
                  practicalCount: { type: "integer", minimum: 0, maximum: 5, default: 0 },
                  difficulty: { type: "integer", minimum: 1, maximum: 3 },
                  focus: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Draft with answer keys" },
          400: err,
          404: err,
          429: err,
          502: err,
        },
      },
    },
    "/admin/assessments": {
      get: {
        tags: ["admin"],
        parameters: [
          { name: "domain", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["draft", "published"] } },
        ],
        responses: { 200: { description: "Assessment summaries" } },
      },
    },
    "/admin/assessments/{id}": {
      get: {
        tags: ["admin"],
        parameters: slugParam,
        responses: { 200: { description: "Full assessment with keys" }, 404: err },
      },
      put: {
        tags: ["admin"],
        summary: "Edit a draft (published ones are read-only)",
        parameters: slugParam,
        responses: { 200: { description: "Saved" }, 400: err, 409: err },
      },
      delete: {
        tags: ["admin"],
        parameters: slugParam,
        responses: { 204: { description: "Deleted" }, 409: err },
      },
    },
    "/admin/assessments/{id}/publish": {
      post: {
        tags: ["admin"],
        summary: "Re-validate and publish (needs at least 3 valid questions)",
        parameters: slugParam,
        responses: { 200: { description: "Published" }, 400: err, 409: err },
      },
    },
    "/admin/assessments/{id}/unpublish": {
      post: {
        tags: ["admin"],
        parameters: slugParam,
        responses: { 200: { description: "Back to draft" }, 409: err },
      },
    },
    "/admin/assessments/{id}/duplicate": {
      post: {
        tags: ["admin"],
        parameters: slugParam,
        responses: { 201: { description: "New draft copy" } },
      },
    },
    "/assessments": {
      get: {
        tags: ["assessments"],
        summary: "Published assessments for your active domain, with your best score",
        responses: { 200: { description: "List" }, 409: err },
      },
    },
    "/assessments/{id}/start": {
      post: {
        tags: ["assessments"],
        summary: "Start (or resume) an attempt. Questions carry no answer keys.",
        parameters: slugParam,
        responses: { 200: { description: "Resumed" }, 201: { description: "Started" }, 404: err },
      },
    },
    "/assessments/attempts": {
      get: {
        tags: ["assessments"],
        summary: "Your submitted attempts",
        responses: { 200: { description: "History" } },
      },
    },
    "/assessments/attempts/{attemptId}": {
      get: {
        tags: ["assessments"],
        parameters: [{ name: "attemptId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Attempt; results with keys only once submitted" },
          404: err,
        },
      },
    },
    "/assessments/attempts/{attemptId}/submit": {
      post: {
        tags: ["assessments"],
        summary:
          "Submit answers. MCQs are auto-graded; written answers are graded by the LLM against the key points. If grading fails the attempt stays open.",
        parameters: [{ name: "attemptId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Graded attempt with answer keys" },
          400: err,
          409: err,
          503: err,
        },
      },
    },
    "/mock-eval/start": {
      post: {
        tags: ["ai"],
        summary:
          "Start a mock interview or practical task for your domain (text only; mode=voice returns 403 while disabled)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  questionCount: { type: "integer", minimum: 3, maximum: 6 },
                  mode: { type: "string", enum: ["text", "voice"] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Evaluation with questions and rubric" },
          403: err,
          409: err,
        },
      },
    },
    "/mock-eval": {
      get: {
        tags: ["ai"],
        summary: "Your evaluations",
        responses: { 200: { description: "List" } },
      },
    },
    "/mock-eval/{id}": {
      get: {
        tags: ["ai"],
        parameters: slugParam,
        responses: { 200: { description: "Evaluation (scores once completed)" }, 404: err },
      },
    },
    "/mock-eval/{id}/submit": {
      post: {
        tags: ["ai"],
        summary:
          "Submit answers; the LLM scores each rubric criterion 0-10 and the server computes the weighted overall score",
        parameters: slugParam,
        responses: { 200: { description: "Scored" }, 400: err, 409: err },
      },
    },
    "/readiness/compute": {
      post: {
        tags: ["ai"],
        summary:
          "Compute your career readiness (0-100) for your active domain from your assessments, mock evaluations, path progress, skill coverage and activity. Uses the ML service; falls back to a weighted formula (isFallback: true) if it is down. At or above the domain's target the decision is 'opportunities', otherwise 'learning' with focus areas.",
        responses: {
          200: { description: "Result with factors, evidence, focus areas and next actions" },
          409: err,
        },
      },
    },
    "/readiness/latest": {
      get: {
        tags: ["ai"],
        responses: { 200: { description: "Latest result" }, 404: err, 409: err },
      },
    },
    "/readiness/history": {
      get: {
        tags: ["ai"],
        summary: "Your last 50 readiness scores, oldest first, with the target",
        responses: { 200: { description: "{ domain, target, points[] }" }, 409: err },
      },
    },
    "/opportunities": {
      get: {
        tags: ["opportunities"],
        summary: "Open opportunities in your domain (or ?domain=), soonest deadline first",
        parameters: [
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" }, description: "Text search" },
          { name: "includeExpired", in: "query", schema: { type: "boolean" } },
        ],
        responses: { 200: { description: "{ opportunities[] }" }, 400: err, 409: err },
      },
    },
    "/opportunities/matches": {
      get: {
        tags: ["opportunities"],
        summary:
          "Your best matches: embedding similarity plus an LLM-written reason and caution each. Falls back to keyword ranking or no reasons when a service is down",
        parameters: [{ name: "type", in: "query", schema: { type: "string" } }],
        responses: {
          200: { description: "{ matches[], rankingFallback, reasonsUnavailable, readiness }" },
          409: err,
          429: err,
        },
      },
    },
    "/opportunities/{id}": {
      get: {
        tags: ["opportunities"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "{ opportunity }" }, 404: err },
      },
    },
    "/applications": {
      get: {
        tags: ["opportunities"],
        summary: "Everything you are tracking, with each opportunity",
        responses: { 200: { description: "{ statuses[], applications[] }" } },
      },
      post: {
        tags: ["opportunities"],
        summary: "Start tracking an opportunity (once per opportunity)",
        responses: { 201: { description: "{ application }" }, 404: err, 409: err },
      },
    },
    "/applications/alerts": {
      get: {
        tags: ["opportunities"],
        summary:
          "Deadlines and your own reminders due within 14 days, plus saved ones whose deadline passed",
        responses: { 200: { description: "{ alerts[] }" } },
      },
    },
    "/applications/{id}": {
      patch: {
        tags: ["opportunities"],
        summary: "Change status (recorded in history), notes or reminders",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "{ application }" }, 400: err, 404: err },
      },
      delete: {
        tags: ["opportunities"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 204: { description: "Removed" }, 404: err },
      },
    },
    "/admin/opportunities": {
      get: {
        tags: ["admin"],
        summary: "All opportunities, including hidden and expired (admin)",
        responses: { 200: { description: "{ opportunities[] }" }, 403: err },
      },
      post: {
        tags: ["admin"],
        summary:
          "Create an opportunity; its type must be offered by the domain and its link must be https (admin)",
        responses: { 201: { description: "{ opportunity }" }, 400: err, 403: err, 404: err },
      },
    },
    "/admin/opportunities/{id}": {
      put: {
        tags: ["admin"],
        summary: "Replace an opportunity's fields and refresh its vector (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "{ opportunity }" }, 400: err, 404: err },
      },
      delete: {
        tags: ["admin"],
        summary: "Delete it and students' tracked applications to it (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 204: { description: "Deleted" }, 404: err },
      },
    },
    "/admin/analytics": {
      get: {
        tags: ["admin"],
        summary:
          "Cohort analytics (admin): users, readiness by domain, module usage, assessments, application funnel. Aggregates only, no student is identifiable",
        parameters: [
          {
            name: "days",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 365, default: 30 },
            description: "Length of the 'recent' window",
          },
        ],
        responses: { 200: { description: "{ analytics }" }, 403: err },
      },
    },
    "/admin/opportunities/reembed": {
      post: {
        tags: ["admin"],
        summary: "Embed opportunities saved while the ML service was down (admin)",
        responses: { 200: { description: "{ checked, embedded }" } },
      },
    },
    "/domains": {
      get: {
        tags: ["domains"],
        security: [],
        summary: "List active domains",
        responses: { 200: ok("DomainListResponse") },
      },
    },
    "/domains/{slug}": {
      get: {
        tags: ["domains"],
        security: [],
        summary: "Full config of an active domain",
        parameters: slugParam,
        responses: { 200: ok("DomainResponse"), 404: err },
      },
    },
    "/admin/domains": {
      get: {
        tags: ["admin"],
        summary: "List all domains, including inactive (admin)",
        responses: { 200: ok("DomainListResponse"), 403: err },
      },
      post: {
        tags: ["admin"],
        summary: "Create a domain (admin)",
        requestBody: json("DomainConfig"),
        responses: { 201: ok("DomainResponse"), 400: err, 403: err, 409: err },
      },
    },
    "/admin/domains/{slug}": {
      get: {
        tags: ["admin"],
        parameters: slugParam,
        responses: { 200: ok("DomainResponse"), 404: err },
      },
      put: {
        tags: ["admin"],
        summary: "Replace a domain's config; the slug cannot change (admin)",
        parameters: slugParam,
        requestBody: json("DomainConfig"),
        responses: { 200: ok("DomainResponse"), 400: err, 404: err },
      },
      delete: {
        tags: ["admin"],
        summary: "Delete an unused domain (admin); 409 if students have it active",
        parameters: slugParam,
        responses: { 204: { description: "Deleted" }, 404: err, 409: err },
      },
    },
  },
};
