'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from "@/components/ui/button"
//import { Textarea } from "@/components/ui/textarea"
import { PenTool, Save, Download, RefreshCw, Loader2 } from "lucide-react"
import Link from "next/link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import { Bold } from "lucide-react"
import { jsPDF } from 'jspdf'

const MAX_CHARACTERS = 1875;

const callOllamaAPI = async (prompt: string, signal?: AbortSignal, onProgress?: (text: string) => void) => {
  const maxRetries = 3;
  const timeout = 300000; // 5 minutes

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${process.env.NEXT_PUBLIC_OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.NEXT_PUBLIC_OLLAMA_MODEL,
          prompt: prompt,
          stream: true,
          num_ctx: 4096,        // Reduce context window
          num_gpu: 1,           // Use GPU if available
          num_thread: 8,        // Increase thread count
          temperature: 0.0,     // Lower temperature for more focused output
          top_k: 30,           // Limit token selection
          top_p: 0.7,          // Nucleus sampling
          repeat_penalty: 0.8   // Prevent repetition
        }),
        signal: signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.trim()) {
                try {
                  const data = JSON.parse(line);
                  if (data.error) throw new Error(data.error);
                  fullText += data.response;
                  // Immediately update the UI with each token
                  onProgress?.(fullText);
                } catch (parseError) {
                  console.error('Error parsing JSON:', parseError);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }

      return fullText;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error;
      }
      console.error(`Attempt ${attempt + 1} failed:`, error);
      if (attempt === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
};

// Add this function before the Editor component
const formatScriptOutput = (script: string) => {
  return script.split('\n').map((line, index) => {
    const trimmedLine = line.trim();
    if (trimmedLine.match(/^(INT\.|EXT\.)/i)) {
      return <p key={index} className="scene-heading">{trimmedLine.toUpperCase()}</p>;
    } else if (trimmedLine.match(/^[A-Z\s]+TO:$/)) {
      return <p key={index} className="transition">{trimmedLine}</p>;
    } else if (trimmedLine === trimmedLine.toUpperCase() && trimmedLine.length > 0 && !trimmedLine.startsWith('(')) {
      return <p key={index} className="character">{trimmedLine}</p>;
    } else if (trimmedLine.startsWith('(') && trimmedLine.endsWith(')')) {
      return <p key={index} className="parenthetical">{trimmedLine}</p>;
    } else if (index > 0) {
      let prevIndex = index - 1;
      const lines = script.split('\n');
      let prevLine = lines[prevIndex].trim();
  
      // Skip over parentheticals and empty lines
      while ((prevLine.startsWith('(') || prevLine.length === 0) && prevIndex > 0) {
          prevIndex--;
          prevLine = lines[prevIndex].trim();
      }
  
      // Now check if the found line is a character name
      if (prevLine === prevLine.toUpperCase() && prevLine.length > 0 && !prevLine.startsWith('(') &&
      !prevLine.match(/^(INT\.|EXT\.|EST\.|INT\/EXT\.|EXT\/INT\.)/i) && !prevLine.match(/^[A-Z\s]+TO:$/)) {
        let dialogueText = trimmedLine;
        const startsWithQuote = trimmedLine.startsWith('"');
        const endsWithQuote = trimmedLine.endsWith('"');

        if (!startsWithQuote && !endsWithQuote) {
          // Add quotes at both ends
          dialogueText = `"${trimmedLine}"`;
        } else if (startsWithQuote && !endsWithQuote) {
          // Add quote at the end
          dialogueText = `${trimmedLine}"`;
        } else if (!startsWithQuote && endsWithQuote) {
          // Add quote at the beginning
          dialogueText = `"${trimmedLine}`;
        }
        // If it starts and ends with a quote, leave it as is

        return <p key={index} className="dialogue">{dialogueText}</p>;
      }
  }  
    return <p key={index} className="action">{line}</p>;
  });
};

// Add this helper function
const isStartOfDialogue = (currentIndex: number, lines: string[]) => {
  if (currentIndex === 0) return true;
  const prevLine = lines[currentIndex - 1]?.trim();
  return prevLine === prevLine.toUpperCase() || (prevLine.startsWith('(') && prevLine.endsWith(')'));
};

const isEndOfDialogue = (currentIndex: number, lines: string[]) => {
  const nextLine = lines[currentIndex + 1]?.trim();
  return !nextLine || !(nextLine.startsWith('(') || nextLine === nextLine.toUpperCase());
};

// Modify the formatDialogue function
const formatDialogue = (text: string, isStart: boolean, isEnd: boolean) => {
  if (isStart && isEnd) return `"${text}"`;
  if (isStart) return `"${text}`;
  if (isEnd) return `${text}"`;
  return text;
};

export function Editor() {
  const [inputScript, setInputScript] = useState('')
  const [outputScript, setOutputScript] = useState('')
  // const [isFormatted, setIsFormatted] = useState(false)
  const [isFormatting, setIsFormatting] = useState(false)
  const [fontSize, setFontSize] = useState('16')
  const [isBold, setIsBold] = useState(false)
  const [fontType, setFontType] = useState('sans')
  const [characterCount, setCharacterCount] = useState(0)
  const formatRequestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setCharacterCount(inputScript.length)
  }, [inputScript])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    if (text.length <= MAX_CHARACTERS) {
      setInputScript(text)
    }
  }

  const handleFormat = async () => {
    if (isFormatting) {
      console.log('Format already in progress, aborting');
      return;
    }

    console.log('Format button clicked');
    setOutputScript('');
    setIsFormatting(true);

    if (formatRequestRef.current) {
      formatRequestRef.current.abort();
    }
    formatRequestRef.current = new AbortController();

    const prompt = `You are a professional screenplay formatter. Format the following text into a professional Hollywood standard screenplay format.
    
${inputScript}

IMPORTANT INSTRUCTIONS:
- Preserve all original content and story structure
- Make sure to output the full original character count, including spaces and punctuations
- Convert script to present tense and check spelling and grammar
- Format the output as a proper screenplay with scene headings, action lines, character names, parentheticals, and dialogue`;

    try {
      await callOllamaAPI(
        prompt, 
        formatRequestRef.current.signal,
        (text) => {
          setOutputScript(text);
        }
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Format request was aborted');
      } else {
        console.error('Error formatting script:', error);
        setOutputScript(`Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}. Please try again.`);
      }
    } finally {
      console.log('Formatting process completed');
      setIsFormatting(false);
      formatRequestRef.current = null;
    }
  };

  const handleClear = () => {
    setInputScript('')
    setOutputScript('')
  }

  const handleExport = () => {
    const doc = new jsPDF();
    const lines = outputScript.split('\n');
    let y = 20;
    let currentPage = 1;
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;

    // Helper function to center text
    const centerText = (text: string, y: number, width: number) => {
      const textWidth = doc.getTextWidth(text);
      const x = (width - textWidth) / 2;
      return x;
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        y += 5;
        return;
      }

      // Check if we need a new page
      if (y > pageHeight - margin) {
        doc.addPage();
        currentPage++;
        y = 20;
      }

      switch (true) {
        case /^(INT\.|EXT\.)/i.test(trimmedLine): {
          // Scene Heading
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text(trimmedLine.toUpperCase(), 25, y);
          y += 10;
          break;
        }
        case /^[A-Z\s]+TO:$/.test(trimmedLine): {
          // Transition
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          const transitionX = centerText(trimmedLine, y, pageWidth);
          doc.text(trimmedLine, transitionX, y);
          y += 10;
          break;
        }
        case trimmedLine === trimmedLine.toUpperCase() && trimmedLine.length > 0 && !trimmedLine.startsWith('('): {
          // Character
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          const characterX = centerText(trimmedLine, y, pageWidth);
          doc.text(trimmedLine, characterX, y);
          y += 10;
          break;
        }
        case trimmedLine.startsWith('(') && trimmedLine.endsWith(')'): {
          // Parenthetical
          doc.setFont("helvetica", "normal");
          doc.setFontSize(12);
          const parentheticalX = centerText(trimmedLine, y, pageWidth);
          doc.text(trimmedLine, parentheticalX, y);
          y += 10;
          break;
        }
        default: {
          // Check if this is dialogue (follows a character or parenthetical)
          if (index > 0) {
            let prevIndex = index - 1;
            let prevLine = lines[prevIndex].trim();
            
            // Skip over parentheticals and empty lines
            while ((prevLine.startsWith('(') || prevLine.length === 0) && prevIndex > 0) {
              prevIndex--;
              prevLine = lines[prevIndex].trim();
            }
            
            // Now check if the found line is a character name
            if (prevLine === prevLine.toUpperCase() && prevLine.length > 0 && !prevLine.startsWith('(') &&
              !prevLine.match(/^(INT\.|EXT\.|EST\.|INT\/EXT\.|EXT\/INT\.)/i) && !prevLine.match(/^[A-Z\s]+TO:$/)) {
              // This is dialogue
              doc.setFont("helvetica", "normal");
              doc.setFontSize(12);
              const dialogueText = `"${trimmedLine}"`;
              // Reduce the width to create larger margins for dialogue
              const textLines = doc.splitTextToSize(dialogueText, 100); // Reduced from 160 to 100
              textLines.forEach((textLine: string) => {
                if (y > pageHeight - margin) {
                  doc.addPage();
                  currentPage++;
                  y = 20;
                }
                const dialogueX = centerText(textLine, y, pageWidth);
                doc.text(textLine, dialogueX, y);
                y += 7;
              });
            } else {
              // This is action
              doc.setFont("helvetica", "normal");
              doc.setFontSize(12);
              const textLines = doc.splitTextToSize(trimmedLine, 160);
              textLines.forEach((textLine: string) => {
                if (y > pageHeight - margin) {
                  doc.addPage();
                  currentPage++;
                  y = 20;
                }
                doc.text(textLine, 25, y);
                y += 7;
              });
            }
          } else {
            // First line is always action
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            const textLines = doc.splitTextToSize(trimmedLine, 160);
            textLines.forEach((textLine: string) => {
              if (y > pageHeight - margin) {
                doc.addPage();
                currentPage++;
                y = 20;
              }
              doc.text(textLine, 25, y);
              y += 7;
            });
          }
          y += 3;
          break;
        }
      }
    });
    
    doc.save("screenplay.pdf");
  };

  const handleReRoll = async () => {
    if (inputScript) {
      await handleFormat()
    } else {
      alert('Please enter a script to re-roll.')
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-purple-100 via-purple-50 to-white">
      <header className="px-4 lg:px-6 h-14 flex items-center border-b border-purple-200">
        <Link className="flex items-center justify-center" href="/">
          <PenTool className="h-6 w-6 text-purple-600" />
          <span className="ml-2 text-2xl font-bold text-purple-800">PATCH</span>
        </Link>
      </header>
      <main className="flex-1 py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none text-purple-800 mb-8">
            Screenplay Editor
          </h1>
          <div className="space-y-4">
            <div className="mb-4 flex items-center space-x-2">
              <Select value={fontSize} onValueChange={setFontSize}>
                <SelectTrigger className="w-[100px] border-purple-600 text-purple-600 hover:bg-purple-100">
                  <SelectValue placeholder="Font Size" />
                </SelectTrigger>
                <SelectContent>
                  {['12', '14', '16', '18', '20', '24'].map(size => (
                    <SelectItem key={size} value={size} className="text-purple-600">{size}px</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Toggle
                pressed={isBold}
                onPressedChange={setIsBold}
                aria-label="Toggle bold"
                className="border-purple-600 text-purple-600 hover:bg-purple-100 data-[state=on]:bg-purple-200"
              >
                <Bold className="h-4 w-4" />
              </Toggle>
              <Select value={fontType} onValueChange={setFontType}>
                <SelectTrigger className="w-[150px] border-purple-600 text-purple-600 hover:bg-purple-100">
                  <SelectValue placeholder="Font Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sans" className="text-purple-600">Sans-serif</SelectItem>
                  <SelectItem value="serif" className="text-purple-600">Serif</SelectItem>
                  <SelectItem value="mono" className="text-purple-600">Monospace</SelectItem>
                  <SelectItem value="courier" className="text-purple-600">Courier</SelectItem>
                  <SelectItem value="helvetica" className="text-purple-600">Helvetica</SelectItem>
                  <SelectItem value="times" className="text-purple-600">Times New Roman</SelectItem>
                  <SelectItem value="georgia" className="text-purple-600">Georgia</SelectItem>
                  <SelectItem value="palatino" className="text-purple-600">Palatino</SelectItem>
                  <SelectItem value="garamond" className="text-purple-600">Garamond</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex-1">
                <div className="screenplay-box h-96 bg-gray-50 border border-gray-200 rounded-lg p-4 relative">
                  <textarea 
                    className={`w-full h-full bg-transparent resize-none outline-none text-black ${
                      fontType === 'sans' ? 'font-sans' :
                      fontType === 'serif' ? 'font-serif' :
                      fontType === 'mono' ? 'font-mono' :
                      fontType === 'courier' ? 'font-courier' :
                      fontType === 'helvetica' ? 'font-helvetica' :
                      fontType === 'times' ? 'font-times' :
                      fontType === 'georgia' ? 'font-georgia' :
                      fontType === 'palatino' ? 'font-palatino' :
                      fontType === 'garamond' ? 'font-garamond' :
                      'font-sans'
                    } ${isBold ? 'font-bold' : 'font-normal'}`}
                    style={{ fontSize: `${fontSize}px` }}
                    value={inputScript}
                    onChange={handleInputChange}
                    placeholder="Start writing your screenplay here..."
                    maxLength={MAX_CHARACTERS}
                  />
                  <div className="absolute bottom-2 right-2 text-sm text-gray-500">
                    {characterCount}/{MAX_CHARACTERS}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-4">
                  <Button 
                    onClick={handleFormat}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Format
                  </Button>
                  <Button 
                    onClick={handleClear}
                    variant="outline"
                    className="border-purple-600 text-purple-600 hover:bg-purple-100"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="flex-1">
                <div className="screenplay-box h-96 bg-gray-50 border border-gray-200 rounded-lg p-4 relative">
                  <div 
                    className={`w-full h-full overflow-auto ${
                      fontType === 'sans' ? 'font-sans' :
                      fontType === 'serif' ? 'font-serif' :
                      fontType === 'mono' ? 'font-mono' :
                      fontType === 'courier' ? 'font-courier' :
                      fontType === 'helvetica' ? 'font-helvetica' :
                      fontType === 'times' ? 'font-times' :
                      fontType === 'georgia' ? 'font-georgia' :
                      fontType === 'palatino' ? 'font-palatino' :
                      fontType === 'garamond' ? 'font-garamond' :
                      'font-sans'
                    } ${isBold ? 'font-bold' : 'font-normal'}`}
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {isFormatting ? (
                      <div className="formatted-script">
                        {formatScriptOutput(outputScript)}
                        <div className="flex items-center mt-2">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          <span>Generating...</span>
                        </div>
                      </div>
                    ) : outputScript ? (
                      <div className="formatted-script">
                        {formatScriptOutput(outputScript)}
                      </div>
                    ) : (
                      <div className="text-gray-500">
                        Formatted script will appear here...
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-4">
                  <Button 
                    onClick={handleExport}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    disabled={!outputScript}
                  >
                    <Download className="mr-2 h-4 w-4" /> Export PDF
                  </Button>
                  <Button 
                    onClick={handleReRoll}
                    variant="outline"
                    className="border-purple-600 text-purple-600 hover:bg-purple-100"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Re-roll
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t bg-purple-50">
        <p className="text-xs text-purple-800">© 2023 PATCH. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4 text-purple-800" href="#">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4 text-purple-800" href="#">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  )
}
