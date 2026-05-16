import webuntis
import datetime

# 1. Configure your WebUntis connection
session = webuntis.Session(
    server='playground.webuntis.com',
    username='untis_monitor',
    password='1Antigravity!',
    school='PG9539789c-69f6-4c8a-9e50-e2343bfb3ec5',
    useragent='WebUntis-Data-Extractor'
)

def generate_school_lists():
    try:
        session.login()
        print("Successfully logged in.")
        
        students = session.students()
        print(f"Successfully fetched {len(students)} students.")
        
        if len(students) > 0:
            s = students[0]
            print(f"First student: {s.surname} {s.forename} (ID: {s.id})")
            
            # Check raw data directly
            if hasattr(s, '_data'):
                print(f"Raw data keys: {s._data.keys()}")
                print(f"Raw data: {s._data}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        try:
            session.logout()
        except:
            pass

if __name__ == "__main__":
    generate_school_lists()
