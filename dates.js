export function formatDate(value){return String(value??'').replace(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/, '$3/$2/$1');}
export function parseDate(value){return String(value??'').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');}
