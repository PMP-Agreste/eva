export type UserRole = 'admin' | 'gestor' | 'guarnicao';

export interface UserProfile {
  role: UserRole;
  ativo: boolean;
  nomeGuerra?: string;
  numeroOrdem?: string;
  updatedAt?: unknown;
  [key: string]: unknown;
}

export interface Assistida {
  id: string;
  nomeCompleto?: string;
  fotoUrl?: string;
  numeroProcesso?: string;
  [key: string]: unknown;
}

export interface Visita {
  id: string;
  idAssistida?: string;
  idAutor?: string;
  dataHora?: unknown;
  status?: string;
  guarnicao?: string;
  [key: string]: unknown;
}

export interface AgendaPlanejada {
  id: string;
  chaveDiaGuarnicao?: string;
  data?: unknown;
  guarnicao?: string;
  [key: string]: unknown;
}
