import { Pool } from 'pg';

export class PostgresService {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async getCustomerByPhone(phone: string): Promise<any | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, nombre_negocio, contacto_nombre, contacto_telefono, contacto_email, business_id
         FROM customers
         WHERE REGEXP_REPLACE(COALESCE(contacto_telefono, ''), '[^0-9]', '', 'g') LIKE $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [`%${phone}%`],
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getLicensesByCustomer(customerId: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, customer_id, status, plan_name, expires_at
         FROM licenses
         WHERE customer_id = $1`,
        [customerId],
      );
      return result.rows;
    } finally {
      client.release();
    }
  }
}
