import { useState, useEffect, useRef } from 'react';
import { Box, Button, Input, Table, Tbody, Tr, Td, Th, Thead, Alert, AlertIcon, Flex, Heading, IconButton, HStack, Select, Input as ChakraInput, Textarea, Tooltip } from '@chakra-ui/react';
import { ArrowLeftIcon, ArrowRightIcon } from '@chakra-ui/icons';
import axios from 'axios';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Metadata {
    pageNumber: number;
    text: string;
    fieldType: string;
    length?: string;
    values?: string;
    boundingBox: BoundingBox[];
    [key: string]: any; // Index signature to allow dynamic updates
}

const Home = () => {
    const [file, setFile] = useState<File | null>(null);
    const [metadata, setMetadata] = useState<Metadata[] | null>(null);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [tooltipText, setTooltipText] = useState<string | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0]);
        }
    };

    const handleFileUpload = async () => {
        setError(null);
        setIsLoading(true);
        if (file) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await axios.post('/api/upload', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                });

                const processedMetadata = processMetadata(response.data.metadata);

                setMetadata(processedMetadata);
                setFileUrl(response.data.fileUrl);
                setCurrentPage(1);
                const totalPages = processedMetadata.length > 0 ? Math.max(...processedMetadata.map((field: Metadata) => field.pageNumber)) : 1;
                setTotalPages(totalPages);
            } catch (uploadError) {
                setError('Failed to upload the file. Please try again.');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const processMetadata = (metadata: Metadata[]): Metadata[] => {
        return metadata.map((field) => {
            if (/yes|no|do|does|do not|does not/i.test(field.text)) {
                field.fieldType = 'checkbox';
            } else if (/date|dob|birth/i.test(field.text)) {
                field.fieldType = 'date';
            } else if (/select|dropdown/i.test(field.text)) {
                field.fieldType = 'dropdown';
            } else {
                field.fieldType = 'text';
            }
            return field;
        });
    };

    const handleExport = () => {
        if (!metadata) return;
        const exportMetadata = metadata.map(({ pageNumber, ...rest }) => rest);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportMetadata));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "metadata.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const goToNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setTotalPages(numPages);
    };

    const handleMetadataChange = (index: number, field: string, value: string) => {
        if (!metadata) return;
        const newMetadata = [...metadata];
        newMetadata[index][field] = value;
        setMetadata(newMetadata);
    };

    const handleMouseEnter = (index: number) => {
        setHoveredIndex(index);
        if (metadata) {
            setTooltipText(metadata[index].text);
        }
    };

    const handleMouseLeave = () => {
        setHoveredIndex(null);
        setTooltipText(null);
    };

    useEffect(() => {
        if (hoveredIndex !== null && metadata) {
            const field = metadata[hoveredIndex];
            highlightText(field.text, field.pageNumber);
        } else {
            clearHighlights();
        }
    }, [hoveredIndex]);

    const highlightText = (text: string, pageNumber: number) => {
        const textLayers = document.querySelectorAll(`.react-pdf__Page[data-page-number="${pageNumber}"] .react-pdf__Page__textContent`);
        textLayers.forEach((layer) => {
            const spans = layer.querySelectorAll('span');
            spans.forEach((span) => {
                if (span.textContent?.includes(text)) {
                    span.style.border = '2px solid red';
                    span.style.backgroundColor = 'transparent';
                    if (tooltipRef.current) {
                        const rect = span.getBoundingClientRect();
                        tooltipRef.current.style.top = `${rect.bottom + window.scrollY}px`;
                        tooltipRef.current.style.left = `${rect.left + window.scrollX}px`;
                        tooltipRef.current.style.display = 'block';
                    }
                } else {
                    span.style.border = 'none';
                }
            });
        });
    };

    const clearHighlights = () => {
        const textLayers = document.querySelectorAll('.react-pdf__Page__textContent');
        textLayers.forEach((layer) => {
            const spans = layer.querySelectorAll('span');
            spans.forEach((span) => {
                span.style.border = 'none';
            });
        });
        if (tooltipRef.current) {
            tooltipRef.current.style.display = 'none';
        }
    };

    return (
        <Box p={4} bg="gray.100" minH="100vh">
            <Box bg="white" p={4} borderRadius="md" boxShadow="sm" mb={4}>
                <Heading size="lg" mb={4} textAlign="center">PDF Metadata Extractor</Heading>
                <Input type="file" onChange={handleFileChange} mb={2} />
                <Button colorScheme="blue" onClick={handleFileUpload} width="full" isLoading={isLoading} loadingText="Uploading">
                    Upload
                </Button>
            </Box>

            {error && (
                <Alert status="error" mb={4}>
                    <AlertIcon />
                    {error}
                </Alert>
            )}

            <Flex mt={4} alignItems="flex-start" height="100vh">
                {fileUrl && (
                    <Box flex="0 0 600px" mr={4} bg="white" p={4} borderRadius="md" boxShadow="sm" height="100%" position="relative">
                        <Document
                            file={fileUrl}
                            onLoadSuccess={onDocumentLoadSuccess}
                            options={{ defaultScale: 1.5 }}
                        >
                            <Page pageNumber={currentPage} width={600} />
                        </Document>
                        <div ref={tooltipRef} style={{
                            position: 'fixed',
                            display: 'top',
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            padding: '8px',
                            borderRadius: '4px',
                            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                            zIndex: 1000,
                            border: '1px solid rgba(0, 0, 0, 0.1)',
                            fontSize: '30px',
                            color: '#333'
                        }}>
                            {tooltipText}
                        </div>
                    </Box>
                )}

                {metadata && (
                    <Box flex="1" bg="white" p={4} borderRadius="md" boxShadow="sm" height="100%" overflowY="auto">
                        <Heading size="md" mb={4} textAlign="center">Page Number: {currentPage}</Heading>
                        <Table variant="simple" colorScheme="gray">
                            <Thead>
                                <Tr>
                                    <Th>Fieldname</Th>
                                    <Th>Field Type</Th>
                                    <Th>Length</Th>
                                    <Th>Values</Th>
                                </Tr>
                            </Thead>
                            <Tbody>
                                {metadata
                                    .filter((field) => field.pageNumber === currentPage)
                                    .map((field, index) => (
                                        <Tr key={`${field.pageNumber}-${index}`} onMouseEnter={() => handleMouseEnter(index)} onMouseLeave={handleMouseLeave}>
                                            <Td>{field.text}</Td>
                                            <Td>
                                                <Select
                                                    value={field.fieldType}
                                                    onChange={(e) => handleMetadataChange(index, 'fieldType', e.target.value)}
                                                >
                                                    <option value="text">Textbox</option>
                                                    <option value="date">Date</option>
                                                    <option value="dropdown">Dropdown</option>
                                                    <option value="checkbox">Checkbox</option>
                                                </Select>
                                            </Td>
                                            <Td>
                                                <ChakraInput
                                                    value={field.length || ''}
                                                    onChange={(e) => handleMetadataChange(index, 'length', e.target.value)}
                                                />
                                            </Td>
                                            <Td>
                                                <Textarea
                                                    value={field.values || ''}
                                                    onChange={(e) => handleMetadataChange(index, 'values', e.target.value)}
                                                />
                                            </Td>
                                        </Tr>
                                    ))}
                            </Tbody>
                        </Table>
                    </Box>
                )}
            </Flex>

            {metadata && (
                <Box mt={4} textAlign="center" position="fixed" bottom="16px" right="16px">
                    <HStack spacing={4} justify="center">
                        <IconButton
                            icon={<ArrowLeftIcon />}
                            onClick={goToPreviousPage}
                            isDisabled={currentPage === 1}
                            aria-label="Previous Page"
                        />
                        <IconButton
                            icon={<ArrowRightIcon />}
                            onClick={goToNextPage}
                            isDisabled={currentPage === totalPages}
                            aria-label="Next Page"
                        />
                        <Button colorScheme="green" onClick={handleExport}>Export Metadata as JSON</Button>
                    </HStack>
                </Box>
            )}
        </Box>
    );
};

export default Home;
