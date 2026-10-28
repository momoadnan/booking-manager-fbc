declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        BOOTSTRAP_SECRET?: string;
        RESEND_API_KEY?: string;
        RESEND_FROM?: string;
      };
    }

    interface Locals {
      user: {
        id: string;
        email: string;
        role: "owner";
      } | null;
    }
  }

  interface D1Result<T = unknown> {
    success: boolean;
    results?: T[];
    meta?: { changes?: number };
    error?: string;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  }
}

export {};
