# Shalev Gym: App Requirements

Cross-platform app for logging and tracking gym workouts.

Source: `App Req.docx`. Numbering matches the source document, so references such as "requirement No. 9" stay valid.

## Requirements

1. The app will be able to log and track gym workouts.
2. The app will receive user input by text and via voice to text.
3. The user will be able to:
   - a. Declare a new workout
   - b. Log their workout
   - c. Ask for a specific workout summary
   - d. Receive a monthly summary of their workouts
4. When the user declares a new workout, the app will:
   - a. Open a new workout record
   - b. Record the time and date
   - c. Wait for user input
5. User workout log input will include:
   - a. Exercise type (e.g. Dumbbell bench press, Cable pushdown etc.)
   - b. Weight (both Kg and Lbs)
   - c. Reps
6. The app will add to each exercise input (independently):
   - a. The total number of sets per exercise
   - b. The start and finish time per set
7. The app will be able to understand and log complicated exercises from the user input, such as:
   - a. Supersets
   - b. Failure
   - c. Pyramid
8. The app will keep logging exercises per the user input under a specific workout until the user declares "end workout".
9. The app will be able to identify targeted muscle groups per workout and understand the whole workout purpose (chest focused, lower body, arms, back & shoulders etc.).
10. There can be multiple workouts per day and multiple exercises per workout.
11. When the user asks for a workout summary, the app will create a simple list composed of:
    - a. Date and time of the workout
    - b. Title of the workout (created independently by the app, per requirement No. 9)
    - c. The list of exercises, number of sets, working weights and reps per set
12. At the end of every calendar month, the app will issue a Monthly summary independently and share it with the user.
13. The Monthly summary will include:
    - a. Workout type (e.g. Bro split, Push/Pull/Legs, Upper/Lower etc.)
    - b. Monthly achievements (PRs either based on reps or weights, most repeated exercise)
    - c. Executive summary
      - Most worked muscle groups
      - Least worked muscle groups
      - Volume per muscle group
    - d. Recommendations for next month
      - Keep current plan / switch
      - Main focus for next month (e.g. legs are neglected, do less chest and give more focus to lower body)
