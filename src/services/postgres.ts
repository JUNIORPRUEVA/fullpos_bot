import { Pool } from 'pg';

export class PostgresService {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async getCustomerByPhone(phone: string): Promise<any | null> {
    const client = await this.pool.connect();
    try {
      let result;
      try {
        result = await client.query(
          `SELECT *
           FROM customers
           WHERE REGEXP_REPLACE(COALESCE(contacto_telefono, phone, telefono, contact_phone, ''), '[^0-9]', '', 'g') LIKE $1
           ORDER BY COALESCE(updated_at, created_at, NOW()) DESC
           LIMIT 1`,
          [`%${phone}%`],
        );
      } catch {
        result = await client.query(
          `SELECT id, nombre_negocio, contacto_nombre, contacto_telefono, contacto_email, business_id
           FROM customers
           WHERE REGEXP_REPLACE(COALESCE(contacto_telefono, ''), '[^0-9]', '', 'g') LIKE $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [`%${phone}%`],
        );
      }
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
        `SELECT *
         FROM licenses
         WHERE customer_id = $1
         ORDER BY COALESCE(expires_at, updated_at, created_at, NOW()) DESC`,
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
}
