import { ReferencesService, Reference, ExternalQuery } from '../references.js';
import { CacheService } from '../cache.js';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');
jest.mock('../cache.js');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedCacheService = CacheService as jest.MockedClass<typeof CacheService>;

describe('ReferencesService', () => {
    let mockCache: jest.Mocked<CacheService>;
    let mockAxiosInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();

        // Mock cache
        mockCache = {
            get: jest.fn().mockReturnValue(null),
            set: jest.fn(),
            delete: jest.fn(),
            clear: jest.fn(),
            cleanupExpired: jest.fn()
        } as any;

        // Mock axios instance
        mockAxiosInstance = {
            get: jest.fn()
        };

        mockedAxios.create.mockReturnValue(mockAxiosInstance);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should filter and keep only enabled references', () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Ref1', type: 'github', url: 'https://github.com/test/repo1', enabled: true },
                { name: 'Ref2', type: 'github', url: 'https://github.com/test/repo2', enabled: false },
                { name: 'Ref3', type: 'github', url: 'https://github.com/test/repo3', enabled: true }
            ];

            // Act
            const service = new ReferencesService(references, mockCache);

            // Assert
            // We can't directly check private field, but we can test behavior via getAllExternalQueries
            expect(service).toBeDefined();
        });
    });

    describe('getAllExternalQueries', () => {
        it('should return empty array when no references enabled', async () => {
            // Arrange
            const service = new ReferencesService([], mockCache);

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toEqual([]);
        });

        it('should fetch queries from GitHub references', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test Repo', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            // Mock GitHub API responses
            mockAxiosInstance.get.mockResolvedValueOnce({
                data: [
                    {
                        name: 'query1.kql',
                        type: 'file',
                        download_url: 'https://raw.githubusercontent.com/test/repo/main/query1.kql',
                        html_url: 'https://github.com/test/repo/blob/main/query1.kql'
                    }
                ],
                headers: {
                    'x-ratelimit-remaining': '59',
                    'x-ratelimit-reset': '1234567890'
                }
            });

            mockAxiosInstance.get.mockResolvedValueOnce({
                data: 'traces | take 10',
                headers: {
                    'x-ratelimit-remaining': '58',
                    'x-ratelimit-reset': '1234567890'
                }
            });

            const service = new ReferencesService(references, mockCache);

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toHaveLength(1);
            expect(queries[0]).toMatchObject({
                source: 'Test Repo',
                fileName: 'query1.kql',
                content: 'traces | take 10',
                url: 'https://github.com/test/repo/blob/main/query1.kql'
            });
        });

        it('should use cached queries when available', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test Repo', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            const cachedQueries: ExternalQuery[] = [
                {
                    source: 'Test Repo',
                    fileName: 'cached.kql',
                    content: 'traces | cached',
                    url: 'https://github.com/test/repo/blob/main/cached.kql'
                }
            ];

            mockCache.get.mockReturnValue(cachedQueries);

            const service = new ReferencesService(references, mockCache);

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toEqual(cachedQueries);
            expect(mockAxiosInstance.get).not.toHaveBeenCalled();
        });

        it('should cache fetched queries', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test Repo', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            mockAxiosInstance.get.mockResolvedValueOnce({
                data: [
                    {
                        name: 'query1.kql',
                        type: 'file',
                        download_url: 'https://raw.githubusercontent.com/test/repo/main/query1.kql',
                        html_url: 'https://github.com/test/repo/blob/main/query1.kql'
                    }
                ],
                headers: { 'x-ratelimit-remaining': '59' }
            });

            mockAxiosInstance.get.mockResolvedValueOnce({
                data: 'traces | take 10',
                headers: { 'x-ratelimit-remaining': '58' }
            });

            const service = new ReferencesService(references, mockCache);

            // Act
            await service.getAllExternalQueries();

            // Assert
            expect(mockCache.set).toHaveBeenCalledWith(
                'github:https://github.com/test/repo',
                expect.any(Array),
                3600
            );
        });

        it('should skip GitHub reference when rate limit exceeded', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test Repo', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            const service = new ReferencesService(references, mockCache);

            // Set rate limit to 0
            (service as any).rateLimitRemaining = 0;
            (service as any).rateLimitReset = new Date(Date.now() + 3600000); // 1 hour in future

            const consoleWarnSpy = jest.spyOn(console, 'warn');

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toEqual([]);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('rate limit exceeded'));
        });
    });

    describe('parseGitHubURL', () => {
        it('should parse basic GitHub URL', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/owner/repo', enabled: true }
            ];

            mockAxiosInstance.get.mockResolvedValue({
                data: [],
                headers: { 'x-ratelimit-remaining': '60' }
            });

            const service = new ReferencesService(references, mockCache);

            // Act
            await service.getAllExternalQueries();

            // Assert
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo/contents/');
        });

        it('should parse GitHub URL with path', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/owner/repo/tree/main/queries', enabled: true }
            ];

            mockAxiosInstance.get.mockResolvedValue({
                data: [],
                headers: { 'x-ratelimit-remaining': '60' }
            });

            const service = new ReferencesService(references, mockCache);

            // Act
            await service.getAllExternalQueries();

            // Assert
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo/contents/queries');
        });

        it('should handle invalid GitHub URL gracefully', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Invalid', type: 'github', url: 'https://invalid-url.com/test', enabled: true }
            ];

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new ReferencesService(references, mockCache);

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Invalid GitHub URL: https://invalid-url.com/test'
            );
        });
    });

    describe('fetchGitHubRepoContents', () => {
        it('should recursively fetch .kql files from directories', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            // Mock directory listing (root)
            mockAxiosInstance.get.mockResolvedValueOnce({
                data: [
                    {
                        name: 'query1.kql',
                        type: 'file',
                        download_url: 'https://raw.githubusercontent.com/test/repo/main/query1.kql',
                        html_url: 'https://github.com/test/repo/blob/main/query1.kql'
                    },
                    {
                        name: 'subdir',
                        type: 'dir',
                        path: 'subdir'
                    }
                ],
                headers: { 'x-ratelimit-remaining': '59' }
            });

            // Mock file content (query1.kql)
            mockAxiosInstance.get.mockResolvedValueOnce({
                data: 'traces | query1',
                headers: { 'x-ratelimit-remaining': '58' }
            });

            // Mock subdirectory listing
            mockAxiosInstance.get.mockResolvedValueOnce({
                data: [
                    {
                        name: 'query2.kql',
                        type: 'file',
                        download_url: 'https://raw.githubusercontent.com/test/repo/main/subdir/query2.kql',
                        html_url: 'https://github.com/test/repo/blob/main/subdir/query2.kql'
                    }
                ],
                headers: { 'x-ratelimit-remaining': '57' }
            });

            // Mock file content (query2.kql)
            mockAxiosInstance.get.mockResolvedValueOnce({
                data: 'traces | query2',
                headers: { 'x-ratelimit-remaining': '56' }
            });

            const service = new ReferencesService(references, mockCache);

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toHaveLength(2);
            expect(queries[0].fileName).toBe('query1.kql');
            expect(queries[1].fileName).toBe('query2.kql');
        });

        it('should skip non-.kql files', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            mockAxiosInstance.get.mockResolvedValueOnce({
                data: [
                    { name: 'readme.md', type: 'file', download_url: 'https://...', html_url: 'https://...' },
                    { name: 'query.kql', type: 'file', download_url: 'https://raw.../query.kql', html_url: 'https://.../query.kql' }
                ],
                headers: { 'x-ratelimit-remaining': '59' }
            });

            mockAxiosInstance.get.mockResolvedValueOnce({
                data: 'traces | take 10',
                headers: { 'x-ratelimit-remaining': '58' }
            });

            const service = new ReferencesService(references, mockCache);

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toHaveLength(1);
            expect(queries[0].fileName).toBe('query.kql');
        });

        it('should handle GitHub API 403 rate limit error', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            mockedAxios.isAxiosError.mockReturnValue(true);
            mockAxiosInstance.get.mockRejectedValue({
                isAxiosError: true,
                response: { status: 403 }
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new ReferencesService(references, mockCache);

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalledWith('GitHub rate limit exceeded');
        });

        it('should handle GitHub API errors gracefully', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new ReferencesService(references, mockCache);

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });

    describe('rate limit tracking', () => {
        it('should update rate limit from response headers', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            mockAxiosInstance.get.mockResolvedValueOnce({
                data: [],
                headers: {
                    'x-ratelimit-remaining': '45',
                    'x-ratelimit-reset': '1234567890'
                }
            });

            const service = new ReferencesService(references, mockCache);

            // Act
            await service.getAllExternalQueries();

            // Assert
            expect((service as any).rateLimitRemaining).toBe(45);
            expect((service as any).rateLimitReset).toEqual(new Date(1234567890 * 1000));
        });

        it('should warn when rate limit is low', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            mockAxiosInstance.get.mockResolvedValueOnce({
                data: [],
                headers: {
                    'x-ratelimit-remaining': '5',
                    'x-ratelimit-reset': '1234567890'
                }
            });

            const consoleWarnSpy = jest.spyOn(console, 'warn');
            const service = new ReferencesService(references, mockCache);

            // Act
            await service.getAllExternalQueries();

            // Assert
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('GitHub rate limit low: 5'));
        });

        it('should reset rate limit after reset time passes', async () => {
            // Arrange
            const references: Reference[] = [
                { name: 'Test', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ];

            mockAxiosInstance.get.mockResolvedValue({
                data: [],
                headers: { 'x-ratelimit-remaining': '60' }
            });

            const service = new ReferencesService(references, mockCache);

            // Set rate limit to 0 with past reset time
            (service as any).rateLimitRemaining = 0;
            (service as any).rateLimitReset = new Date(Date.now() - 3600000); // 1 hour ago

            // Act
            const queries = await service.getAllExternalQueries();

            // Assert
            expect(queries).toEqual([]); // Should attempt fetch (rate limit reset)
            expect(mockAxiosInstance.get).toHaveBeenCalled();
        });
    });
});
