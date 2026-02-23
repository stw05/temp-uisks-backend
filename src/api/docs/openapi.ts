export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "STIVS Temporary Backend API",
    version: "0.2.0",
    description: "Temporary backend contract for front-end integration"
  },
  servers: [{ url: "http://localhost:3000" }],
  tags: [
    { name: "Auth" },
    { name: "Projects" },
    { name: "Employees" },
    { name: "Publications" },
    { name: "Finances" }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" }
        },
        example: {
          error: "Unauthorized"
        }
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          role: { type: "string", enum: ["admin", "staff", "viewer"] }
        },
        example: {
          id: "2ca8f8f0-bab3-42c2-8032-5324d7d06d7a",
          email: "admin@example.com",
          name: "Admin User",
          role: "admin"
        }
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          lead: { type: "string" },
          region: { type: "string" },
          status: { type: "string" },
          budget: { type: "number" },
          spent: { type: "number" },
          startDate: { type: "string", nullable: true },
          endDate: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" } },
          description: { type: "string" },
          teamIds: { type: "array", items: { type: "string" } },
          publicationsIds: { type: "array", items: { type: "string" } },
          files: { type: "array", items: { type: "string" } }
        },
        example: {
          id: "tmp-project-1",
          title: "AI-driven Materials",
          lead: "Lead A",
          region: "Алматы",
          status: "active",
          budget: 100000,
          spent: 25000,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          tags: ["applied", "TRL-4"],
          description: "Temporary project description",
          teamIds: ["emp-1"],
          publicationsIds: ["pub-1"],
          files: ["report.pdf"]
        }
      },
      Employee: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          position: { type: "string" },
          department: { type: "string" },
          region: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          avatarUrl: { type: "string" },
          projectsIds: { type: "array", items: { type: "string" } },
          metrics: { type: "object", additionalProperties: { type: "number" } },
          bio: { type: "string" },
          publicationsIds: { type: "array", items: { type: "string" } }
        },
        example: {
          id: "emp-1",
          name: "John Doe",
          position: "Researcher",
          department: "RND",
          region: "Астана",
          email: "john@example.com",
          phone: "+77000000000",
          avatarUrl: "",
          projectsIds: ["tmp-project-1"],
          metrics: { hIndex: 4 },
          bio: "Short bio",
          publicationsIds: ["pub-1"]
        }
      },
      Publication: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          authors: { type: "array", items: { type: "string" } },
          year: { type: "number" },
          type: { type: "string" },
          doi: { type: "string" },
          projectId: { type: "string" },
          link: { type: "string" },
          abstract: { type: "string" },
          pdfUrl: { type: "string" }
        },
        example: {
          id: "pub-1",
          title: "Paper",
          authors: ["John Doe"],
          year: 2026,
          type: "journal",
          doi: "10.1000/test",
          projectId: "tmp-project-1",
          link: "https://example.com",
          abstract: "A",
          pdfUrl: "https://example.com/a.pdf"
        }
      },
      PaginationMeta: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1 },
          limit: { type: "integer", minimum: 1 },
          total: { type: "integer", minimum: 0 },
          totalPages: { type: "integer", minimum: 0 },
          hasNextPage: { type: "boolean" },
          hasPrevPage: { type: "boolean" }
        },
        required: ["page", "limit", "total", "totalPages", "hasNextPage", "hasPrevPage"]
      },
      ProjectListResponse: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Project" }
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" }
        },
        required: ["items", "meta"]
      },
      EmployeeListResponse: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Employee" }
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" }
        },
        required: ["items", "meta"]
      },
      PublicationListResponse: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Publication" }
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" }
        },
        required: ["items", "meta"]
      },
      FinanceSummary: {
        type: "object",
        properties: {
          totalBudget: { type: "number" },
          totalSpent: { type: "number" },
          byCategory: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                amount: { type: "number" }
              }
            }
          },
          byRegion: {
            type: "array",
            items: {
              type: "object",
              properties: {
                region: { type: "string" },
                amount: { type: "number" }
              }
            }
          }
        },
        example: {
          totalBudget: 500000,
          totalSpent: 200000,
          byCategory: [{ category: "equipment", amount: 120000 }],
          byRegion: [{ region: "Алматы", amount: 50000 }]
        }
      },
      FinanceProject: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          budget: { type: "number" },
          spent: { type: "number" },
          history: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                amount: { type: "number" },
                category: { type: "string" },
                note: { type: "string" }
              }
            }
          }
        },
        example: {
          projectId: "tmp-project-1",
          budget: 100000,
          spent: 12000,
          history: [{ date: "2026-02-23", amount: 12000, category: "equipment", note: "initial" }]
        }
      }
    }
  },
  paths: {
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  name: { type: "string" },
                  role: { type: "string", enum: ["admin", "staff", "viewer"] }
                }
              },
              example: {
                email: "admin@example.com",
                password: "supersecret123",
                name: "Admin User",
                role: "admin"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                example: {
                  token: "<jwt>",
                  user: {
                    id: "2ca8f8f0-bab3-42c2-8032-5324d7d06d7a",
                    email: "admin@example.com",
                    fullName: "Admin User",
                    role: "admin"
                  }
                }
              }
            }
          },
          "409": {
            description: "Already exists",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { error: "User already exists" }
              }
            }
          }
        }
      }
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" }
                }
              },
              example: {
                email: "admin@example.com",
                password: "supersecret123"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                example: {
                  token: "<jwt>",
                  role: "admin",
                  user: {
                    id: "2ca8f8f0-bab3-42c2-8032-5324d7d06d7a",
                    email: "admin@example.com",
                    name: "Admin User"
                  }
                }
              }
            }
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { error: "Invalid credentials" }
              }
            }
          }
        }
      }
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Success",
            content: { "application/json": { example: { success: true } } }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { error: "Unauthorized" }
              }
            }
          }
        }
      }
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                example: {
                  user: {
                    id: "2ca8f8f0-bab3-42c2-8032-5324d7d06d7a",
                    email: "admin@example.com",
                    name: "Admin User",
                    role: "admin"
                  },
                  role: "admin"
                }
              }
            }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { error: "Unauthorized" }
              }
            }
          }
        }
      }
    },
    "/api/projects": {
      get: {
        tags: ["Projects"],
        summary: "List projects",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "region", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProjectListResponse" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Projects"],
        summary: "Create project (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Project" },
              example: {
                id: "tmp-project-1",
                title: "AI-driven Materials",
                lead: "Lead A",
                region: "Алматы",
                status: "active",
                budget: 100000,
                spent: 0,
                startDate: "2026-01-01",
                endDate: "2026-12-31",
                tags: ["applied"]
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Project" } } }
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      }
    },
    "/api/projects/{id}": {
      get: {
        tags: ["Projects"],
        summary: "Get project",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Success",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Project" } } }
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      },
      patch: {
        tags: ["Projects"],
        summary: "Update project (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                status: "completed",
                spent: 85000
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Project" } } }
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      },
      delete: {
        tags: ["Projects"],
        summary: "Delete project (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "204": { description: "Deleted" },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      }
    },
    "/api/employees": {
      get: {
        tags: ["Employees"],
        summary: "List employees",
        parameters: [
          { name: "region", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EmployeeListResponse" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Employees"],
        summary: "Create employee (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Employee" }
            }
          }
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Employee" } } }
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      }
    },
    "/api/employees/{id}": {
      get: {
        tags: ["Employees"],
        summary: "Get employee",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Success",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Employee" } } }
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      },
      patch: {
        tags: ["Employees"],
        summary: "Update employee (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                position: "Senior Researcher",
                metrics: { hIndex: 6 }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Employee" } } }
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      },
      delete: {
        tags: ["Employees"],
        summary: "Delete employee (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "204": { description: "Deleted" },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      }
    },
    "/api/publications": {
      get: {
        tags: ["Publications"],
        summary: "List publications",
        parameters: [
          { name: "year", in: "query", schema: { type: "number" } },
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PublicationListResponse" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Publications"],
        summary: "Create publication (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Publication" }
            }
          }
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Publication" } } }
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      }
    },
    "/api/publications/{id}": {
      get: {
        tags: ["Publications"],
        summary: "Get publication",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Success",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Publication" } } }
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      },
      patch: {
        tags: ["Publications"],
        summary: "Update publication (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                doi: "10.1000/updated",
                type: "conference"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Publication" } } }
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      },
      delete: {
        tags: ["Publications"],
        summary: "Delete publication (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "204": { description: "Deleted" },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      }
    },
    "/api/finances/summary": {
      get: {
        tags: ["Finances"],
        summary: "Finance summary",
        parameters: [{ name: "year", in: "query", schema: { type: "number" } }],
        responses: {
          "200": {
            description: "Success",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FinanceSummary" } } }
          }
        }
      }
    },
    "/api/finances/projects/{projectId}": {
      get: {
        tags: ["Finances"],
        summary: "Finance details by project",
        parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Success",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FinanceProject" } } }
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      }
    },
    "/api/finances/projects/{projectId}/history": {
      post: {
        tags: ["Finances"],
        summary: "Add finance history item (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                date: "2026-02-23",
                amount: 12000,
                category: "equipment",
                note: "initial"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FinanceProject" } } }
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      },
      patch: {
        tags: ["Finances"],
        summary: "Update finance history (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                date: "2026-02-24",
                amount: 5000,
                category: "travel",
                note: "updated item"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FinanceProject" } } }
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
          }
        }
      }
    }
  }
};
