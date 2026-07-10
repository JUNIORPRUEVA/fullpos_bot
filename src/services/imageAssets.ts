export interface FullposImageAsset {
  id: string;
  title: string;
  file: string;
  caption: string;
  keywords: RegExp;
}

export const FULLPOS_IMAGE_ASSETS: FullposImageAsset[] = [
  {
    id: 'owner',
    title: 'FullPOS Owner / Nube',
    file: 'nube-owner.png',
    caption: 'Aqui puedes ver la parte de Nube de FullPOS, desde donde se descarga/vincula FullPOS Owner escaneando el codigo con el celular.',
    keywords: /\b(owner|due[nñ]o|celular|movil|m[oó]vil|nube|app|qr|codigo|c[oó]digo)\b/i,
  },
  {
    id: 'ventas',
    title: 'Ventas y catalogo',
    file: 'ventas-catalogo.png',
    caption: 'Esta es una captura del area de ventas/catalogo de FullPOS, pensada para vender rapido, buscar productos y trabajar con el inventario.',
    keywords: /\b(venta|ventas|vender|catalogo|cat[aá]logo|producto|productos|barcode|barra|codigo de barra)\b/i,
  },
  {
    id: 'factura',
    title: 'Factura de venta',
    file: 'factura-venta.png',
    caption: 'Aqui tienes una vista de factura de venta en FullPOS, para que veas como se presenta la operacion al cobrar.',
    keywords: /\b(factura|ticket|comprobante|cobrar|venta|recibo)\b/i,
  },
  {
    id: 'compras',
    title: 'Compra manual',
    file: 'compra-manual.png',
    caption: 'Esta captura muestra el registro de compra manual, util para organizar compras, suplidores, costos y entrada de mercancia.',
    keywords: /\b(compra|compras|suplidor|proveedor|mercancia|mercanc[ií]a|costo|entrada)\b/i,
  },
  {
    id: 'categorias',
    title: 'Categorias y productos',
    file: 'categorias-productos.png',
    caption: 'Aqui se ve la gestion de categorias/productos para mantener el inventario organizado.',
    keywords: /\b(categoria|categor[ií]a|categorias|categor[ií]as|inventario|stock|producto|productos)\b/i,
  },
  {
    id: 'hero',
    title: 'FullPOS en dispositivos',
    file: 'hero-fullpos-devices.png',
    caption: 'Esta imagen muestra FullPOS como solucion para controlar ventas, inventario, caja y reportes del negocio.',
    keywords: /\b(sistema|fullpos|pantalla|imagen|foto|captura|como se ve|interfaz|demostracion|demostraci[oó]n)\b/i,
  },
  {
    id: 'principal',
    title: 'FullPOS principal',
    file: 'imagenprincipal.png',
    caption: 'Vista comercial de FullPOS para presentar el sistema al cliente.',
    keywords: /\b(presentacion|presentaci[oó]n|principal|publicidad|promocional|informacion|informaci[oó]n)\b/i,
  },
  {
    id: 'logo',
    title: 'Logo FullPOS',
    file: 'logo.png',
    caption: 'Logo oficial de FullPOS.',
    keywords: /\b(logo|marca|fullpos)\b/i,
  },
];

export function isAskingForImage(message: string): boolean {
  return /\b(imagen|imagenes|im[aá]genes|foto|fotos|captura|capturas|pantalla|ver como|como se ve|quiero ver|ver la|ver el|mu[eé]strame|muestrame|ens[eé][nñ]ame|visual|screenshot)\b/i.test(message);
}

export function selectFullposImage(message: string): FullposImageAsset {
  const found = FULLPOS_IMAGE_ASSETS.find((asset) => asset.keywords.test(message));
  return found || FULLPOS_IMAGE_ASSETS.find((asset) => asset.id === 'hero') || FULLPOS_IMAGE_ASSETS[0];
}

export function publicAssetUrl(publicBaseUrl: string, asset: FullposImageAsset): string {
  return `${publicBaseUrl.replace(/\/$/, '')}/assets/fullpos/${encodeURIComponent(asset.file)}`;
}
