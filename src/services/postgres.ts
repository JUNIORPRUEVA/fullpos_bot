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
    } catch (error) {
      if (this.isMissingTable(error)) {
        console.warn('Postgres customers table is missing; continuing without customer context.');
        return null;
      }
      throw error;
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
    } catch (error) {
      if (this.isMissingTable(error)) {
        console.warn('Postgres licenses table is missing; continuing without license context.');
        return [];
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private isMissingTable(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === '42P01';
  }
}
