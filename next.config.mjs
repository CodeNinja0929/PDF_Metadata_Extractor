import path from 'path';

export default {
    async rewrites() {
        return [
            {
                source: '/uploads/:path*',
                destination: '/api/uploads/:path*', // Matched parameters can be used in the destination
            },
        ];
    },
};


