import re
import os
import pandas as pd
from typing import List, Dict, Any

def detect_department_from_usn(usn: str) -> str:
    """
    Extracts the department code from a VTU USN.
    Example: 2BL21CI006 -> CI
    """
    if len(usn) >= 7:
        return usn[5:7].upper()
    return "GEN"

def detect_batch_from_usn(usn: str) -> int:
    """
    Extracts the joining year from a VTU USN.
    Example: 2BL21CI006 -> 2021
    """
    if len(usn) >= 5:
        year_str = usn[3:5]
        if year_str.isdigit():
            return 2000 + int(year_str)
    return 2021

def validate_usn(usn: str) -> bool:
    """
    Validates if a string is a standard VTU USN.
    E.g. 2BL21CI006 or 2BL22CS001
    """
    pattern = r"^[1-4][A-Z]{2}\d{2}[A-Z]{2}\d{3}$"
    return bool(re.match(pattern, usn.strip().upper()))

def parse_result(text: str) -> List[List[Any]]:
    """
    Parses VTU results text from page body.
    Returns: list of rows [usn, name, sem, subject_code, subject_name, internal, external, total, result, date]
    """
    try:
        # Search for header info
        usn_match = re.search(r"University Seat Number\s*:\s*(\S+)", text)
        name_match = re.search(r"Student Name\s*:\s*(.+)", text)
        sem_match = re.search(r"Semester\s*:\s*(\d+)", text)
        
        if not usn_match or not name_match or not sem_match:
            # Fallback if text format is slightly different
            return []
            
        usn = usn_match.group(1).strip()
        name = name_match.group(1).strip()
        sem = sem_match.group(1).strip()
        
        # Regex Pattern to match marks. We enforce the subject code (\w{5,10}) to be between 5 and 10 characters.
        # This completely avoids matching shorter words like 'on' (from 'Click on ...' HTML text).
        pattern = r"(\w{5,10})\s+([A-Z0-9\s&\-,]+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+([PF])\s+(\d{4}-\d{2}-\d{2})"
        matches = re.findall(pattern, text)
        
        results = []
        for m in matches:
            subj_code = m[0].strip()
            subj_name = m[1].strip()
            
            # Clean tab or extra whitespace from subject name
            subj_name = re.sub(r"\s+", " ", subj_name)
            
            results.append([
                usn,
                name,
                int(sem),
                subj_code,
                subj_name,
                int(m[2]),
                int(m[3]),
                int(m[4]),
                m[5],
                m[6]
            ])
            
        return results
    except Exception as e:
        print(f"Error parsing result text: {e}")
        return []

def load_usns_from_file(file_path: str, column_name: str = "USN") -> List[str]:
    """
    Loads USNs from CSV or Excel file.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext == ".csv":
        # Try multiple encodings Case-Insensitively. Latin-1 serves as a failsafe fallback that always decodes.
        encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252", "utf-16le", "utf-16"]
        df = None
        last_err = None
        for enc in encodings:
            try:
                df = pd.read_csv(file_path, encoding=enc)
                break
            except Exception as e:
                last_err = e
                continue
        if df is None:
            raise ValueError(f"Failed to decode CSV file: {last_err}")
    elif ext in [".xls", ".xlsx"]:
        df = pd.read_excel(file_path)
    else:
        raise ValueError("Unsupported file format. Please upload CSV or Excel (.xlsx).")
        
    # Search for USN column case-insensitively if specified column doesn't match
    target_col = column_name
    if target_col not in df.columns:
        for col in df.columns:
            if col.upper().strip() in ["USN", "USN CODE", "STUDENT USN", "ROLL NUMBER", "ROLLNO"]:
                target_col = col
                break
                
    if target_col not in df.columns:
        raise ValueError(f"USN column not found. Columns found: {list(df.columns)}")
        
    usn_list = df[target_col].dropna().astype(str).str.strip().tolist()
    # Filter and validate USNs
    valid_usns = []
    for usn in usn_list:
        if usn:
            # Clean common typos (spaces, quotes)
            clean_usn = usn.replace("\"", "").replace("'", "").strip().upper()
            if validate_usn(clean_usn):
                valid_usns.append(clean_usn)
                
    return valid_usns
