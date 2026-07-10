import { Pool } from 'pg';

export class PostgresService {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async getCustomerByPhone(phone: string): Promise<any | null> {
    const client = await this.pool.connect();
    try {
      const columns = await this.getTableColumns(client, 'customers');
      const phoneColumn = this.pickColumn(columns, ['contacto_telefono', 'phone', 'telefono', 'contact_phone', 'whatsapp', 'mobile']);
      if (!phoneColumn) return null;
      const orderColumn = this.pickColumn(columns, ['updated_at', 'created_at', 'id']);
      const orderSql = orderColumn ? `ORDER BY ${this.quoteIdent(orderColumn)} DESC` : '';
      const result = await client.query(
        `SELECT *
         FROM customers
         WHERE REGEXP_REPLACE(COALESCE(${this.quoteIdent(phoneColumn)}::text, ''), '[^0-9]', '', 'g') LIKE $1
         ${orderSql}
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
      const columns = await this.getTableColumns(client, 'licenses');
      const customerColumn = this.pickColumn(columns, ['customer_id', 'customerId', 'client_id']);
      if (!customerColumn) return [];
      const orderColumn = this.pickColumn(columns, ['expires_at', 'expiration_date', 'fecha_vencimiento', 'updated_at', 'created_at', 'id']);
      const orderSql = orderColumn ? `ORDER BY ${this.quoteIdent(orderColumn)} DESC` : '';
      const result = await client.query(
        `SELECT *
         FROM licenses
         WHERE ${this.quoteIdent(customerColumn)} = $1
         ${orderSql}`,
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

  classifyCustomer(customer: any | null, licenses: any[]): {
    status: 'new' | 'registered' | 'demo_active' | 'demo_expired' | 'licensed' | 'license_expired' | 'blocked' | 'payment_pending' | 'unknown';
    label: string;
    activeLicense?: any;
    latestLicense?: any;
  } {
    if (!customer) {
      return { status: 'new', label: 'Cliente nuevo sin registro encontrado' };
    }

    const now = Date.now();
    const normalized = licenses.map((license) => ({
      ...license,
      statusText: String(license.status || license.estado || license.license_status || '').toLowerCase(),
      expiresAt: license.expires_at || license.expiration_date || license.fecha_vencimiento || license.valid_until || null,
      planName: license.plan_name || license.plan || license.product_name || license.tipo_plan || '',
    }));
    const latestLicense = normalized[0];
    const activeLicense = normalized.find((license) => {
      const expires = license.expiresAt ? new Date(license.expiresAt).getTime() : 0;
      return ['activa', 'active', 'vigente'].includes(license.statusText) || (expires && expires > now);
    });
    const blocked = normalized.find((license) => ['bloqueada', 'blocked', 'suspended'].includes(license.statusText));
    const pending = normalized.find((license) => ['pendiente', 'pending', 'payment_pending'].includes(license.statusText));
    const expired = normalized.find((license) => {
      const expires = license.expiresAt ? new Date(license.expiresAt).getTime() : 0;
      return ['vencida', 'expired'].includes(license.statusText) || (expires && expires < now);
    });
    const demo = normalized.find((license) => /demo|prueba/i.test(String(license.planName || license.statusText)));

    if (blocked) return { status: 'blocked', label: 'Cliente registrado con licencia bloqueada', latestLicense };
    if (activeLicense && demo) return { status: 'demo_active', label: 'Cliente con demo activa', activeLicense, latestLicense };
    if (activeLicense) return { status: 'licensed', label: 'Cliente con licencia activa', activeLicense, latestLicense };
    if (pending) return { status: 'payment_pending', label: 'Cliente con pago o licencia pendiente', latestLicense };
    if (expired && demo) return { status: 'demo_expired', label: 'Cliente con demo vencida', latestLicense };
    if (expired) return { status: 'license_expired', label: 'Cliente con licencia vencida', latestLicense };

    return { status: 'registered', label: 'Cliente registrado sin licencia activa detectada', latestLicense };
  }

  private isMissingTable(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === '42P01';
  }

  private async getTableColumns(client: any, tableName: string): Promise<string[]> {
    const result = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName],
    );
    return result.rows.map((row: any) => String(row.column_name));
  }

  private pickColumn(columns: string[], candidates: string[]): string {
    const lowerMap = new Map(columns.map((column) => [column.toLowerCase(), column]));
    for (const candidate of candidates) {
      const found = lowerMap.get(candidate.toLowerCase());
      if (found) return found;
    }
    return '';
  }

  private quoteIdent(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
