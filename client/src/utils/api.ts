/**
 * API utility functions for making authenticated requests
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export interface ApiError {
  detail: string;
  status: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

/**
 * Make an authenticated API request
 * Automatically includes Authorization header if token is available
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit & { accessToken?: string } = {}
): Promise<T> {
  const { accessToken, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  // Add authorization header if token is provided
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error((errorData as any).detail || 'API request failed') as Error & ApiError;
      (error as any).status = response.status;
      throw error;
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error occurred');
  }
}

/**
 * GET request helper
 */
export async function apiGet<T = any>(
  endpoint: string,
  accessToken?: string
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'GET',
    accessToken,
  });
}

/**
 * POST request helper
 */
export async function apiPost<T = any>(
  endpoint: string,
  data?: any,
  accessToken?: string
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
    accessToken,
  });
}

/**
 * PATCH request helper
 */
export async function apiPatch<T = any>(
  endpoint: string,
  data?: any,
  accessToken?: string
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
    accessToken,
  });
}

/**
 * PUT request helper
 */
export async function apiPut<T = any>(
  endpoint: string,
  data?: any,
  accessToken?: string
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
    accessToken,
  });
}

/**
 * DELETE request helper
 */
export async function apiDelete<T = any>(
  endpoint: string,
  accessToken?: string
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'DELETE',
    accessToken,
  });
}

/**
 * Hook-friendly API call wrapper for use in components
 */
export function useApi() {
  return {
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    put: apiPut,
    delete: apiDelete,
  };
}

/**
 * Error handling utility
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Check if error is a 401 Unauthorized
 */
export function isUnauthorizedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'status' in error &&
    (error as any).status === 401
  );
}

/**
 * Check if error is a 403 Forbidden
 */
export function isForbiddenError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'status' in error &&
    (error as any).status === 403
  );
}

/**
 * Check if error is a 404 Not Found
 */
export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'status' in error &&
    (error as any).status === 404
  );
}

/**
 * Check if error is a validation error (422)
 */
export function isValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'status' in error &&
    (error as any).status === 422
  );
}
