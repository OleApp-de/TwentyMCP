import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface ListResponse<T> {
  data: {
    [key: string]: T[];
  };
  pageInfo?: PageInfo;
  totalCount?: number;
}

export interface SingleResponse<T> {
  data: {
    [key: string]: T;
  };
}

export interface Person {
  id?: string;
  position?: number;
  intro?: string;
  workPreference?: string;
  performanceRating?: number;
  name?: {
    firstName?: string;
    lastName?: string;
  };
  email?: string;
  linkedinLink?: any;
  xLink?: any;
  jobTitle?: string;
  phone?: string;
  city?: string;
  whatsapp?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  company?: any;
  companyId?: string;
}

export interface Company {
  id?: string;
  position?: number;
  idealCustomerProfile?: boolean;
  targetAccount?: boolean;
  name?: string;
  domainName?: any;
  address?: any;
  employees?: number;
  linkedinLink?: any;
  xLink?: any;
  annualRecurringRevenue?: any;
  visaSponsorship?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  people?: any[];
  opportunities?: any[];
}

export interface Task {
  id?: string;
  position?: number;
  title?: string;
  body?: string;
  bodyV2?: any;
  dueAt?: string;
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  assigneeId?: string;
  assignee?: any;
}

export interface Note {
  id?: string;
  position?: number;
  title?: string;
  body?: string;
  bodyV2?: any;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface Opportunity {
  id?: string;
  position?: number;
  amount?: any;
  name?: string;
  closeDate?: string;
  stage?: 'NEW' | 'SCREENING' | 'MEETING' | 'PROPOSAL' | 'CUSTOMER';
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  pointOfContact?: any;
  company?: any;
}

export interface QueryParams {
  orderBy?: string;
  filter?: Record<string, any>;
  limit?: number;
  depth?: number;
  startingAfter?: string;
  endingBefore?: string;
}

export class TwentyCRMClient {
  private client: AxiosInstance;
  private logger: Logger;

  constructor(apiKey: string, logger: Logger) {
    this.logger = logger;
    
    // Remove 'Bearer ' prefix if present
    const token = apiKey.startsWith('Bearer ') ? apiKey.substring(7) : apiKey;
    
    this.client = axios.create({
      baseURL: process.env.TWENTY_CRM_URL || 'https://crm.tools.ole.de/rest',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Add request/response logging
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug('API Request:', {
          method: config.method,
          url: config.url,
          params: config.params
        });
        return config;
      },
      (error) => {
        this.logger.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug('API Response:', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        this.logger.error('API Response Error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  async testConnection(): Promise<void> {
    await this.client.get('/people', { params: { limit: 1 } });
  }

  // People endpoints
  async findManyPeople(params?: QueryParams): Promise<ListResponse<Person>> {
    const response = await this.client.get('/people', { params });
    return response.data;
  }

  async findOnePerson(id: string, depth?: number): Promise<SingleResponse<Person>> {
    const response = await this.client.get(`/people/${id}`, { params: { depth } });
    return response.data;
  }

  async createOnePerson(data: Person, depth?: number): Promise<SingleResponse<Person>> {
    const response = await this.client.post('/people', data, { params: { depth } });
    return response.data;
  }

  async updateOnePerson(id: string, data: Partial<Person>, depth?: number): Promise<SingleResponse<Person>> {
    const response = await this.client.patch(`/people/${id}`, data, { params: { depth } });
    return response.data;
  }

  async deleteOnePerson(id: string): Promise<void> {
    await this.client.delete(`/people/${id}`);
  }

  // Companies endpoints
  async findManyCompanies(params?: QueryParams): Promise<ListResponse<Company>> {
    const response = await this.client.get('/companies', { params });
    return response.data;
  }

  async findOneCompany(id: string, depth?: number): Promise<SingleResponse<Company>> {
    const response = await this.client.get(`/companies/${id}`, { params: { depth } });
    return response.data;
  }

  async createOneCompany(data: Company, depth?: number): Promise<SingleResponse<Company>> {
    const response = await this.client.post('/companies', data, { params: { depth } });
    return response.data;
  }

  async updateOneCompany(id: string, data: Partial<Company>, depth?: number): Promise<SingleResponse<Company>> {
    const response = await this.client.patch(`/companies/${id}`, data, { params: { depth } });
    return response.data;
  }

  async deleteOneCompany(id: string): Promise<void> {
    await this.client.delete(`/companies/${id}`);
  }

  // Tasks endpoints
  async findManyTasks(params?: QueryParams): Promise<ListResponse<Task>> {
    const response = await this.client.get('/tasks', { params });
    return response.data;
  }

  async findOneTask(id: string, depth?: number): Promise<SingleResponse<Task>> {
    const response = await this.client.get(`/tasks/${id}`, { params: { depth } });
    return response.data;
  }

  async createOneTask(data: Task, depth?: number): Promise<SingleResponse<Task>> {
    const response = await this.client.post('/tasks', data, { params: { depth } });
    return response.data;
  }

  async updateOneTask(id: string, data: Partial<Task>, depth?: number): Promise<SingleResponse<Task>> {
    const response = await this.client.patch(`/tasks/${id}`, data, { params: { depth } });
    return response.data;
  }

  async deleteOneTask(id: string): Promise<void> {
    await this.client.delete(`/tasks/${id}`);
  }

  // Notes endpoints
  async findManyNotes(params?: QueryParams): Promise<ListResponse<Note>> {
    const response = await this.client.get('/notes', { params });
    return response.data;
  }

  async createOneNote(data: Note): Promise<void> {
    await this.client.post('/notes', data);
  }

  // Opportunities endpoints
  async findManyOpportunities(params?: QueryParams): Promise<ListResponse<Opportunity>> {
    const response = await this.client.get('/opportunities', { params });
    return response.data;
  }

  async createOneOpportunity(data: Opportunity): Promise<void> {
    await this.client.post('/opportunities', data);
  }
}