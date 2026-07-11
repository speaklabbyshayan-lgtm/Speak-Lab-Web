import os
import glob

replacements = [
    ("PKR 20,000", "PKR 25,000"),
    ("PKR 15,000", "PKR 20,000"),
    ("PKR 5,000", "PKR 10,000"),
    ("\"15000\"", "\"20000\""),
    (" 15000,", " 20000,"),
    ("Monday, Wednesday, and Friday", "Flexible days (Regular & Weekend Batches)"),
    ("Monday, Wednesday, Friday", "Flexible days (Regular & Weekend Batches)"),
    ("Mo,We,Fr", "Flexible Days")
]

files = glob.glob(r"e:\speaklabs\*.html") + glob.glob(r"e:\speaklabs\*.json") + glob.glob(r"e:\speaklabs\*.js")

for filepath in files:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        new_content = content
        for old_str, new_str in replacements:
            new_content = new_content.replace(old_str, new_str)
            
        if new_content != content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Updated {os.path.basename(filepath)}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
