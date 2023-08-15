import { RefreshInfo } from '../SearchIndex/types';

export interface StatusResponse {
  manifests: string[];
  lastSync?: RefreshInfo | null;
}
